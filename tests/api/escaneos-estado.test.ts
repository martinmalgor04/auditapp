import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { insertTestAuditRow } from '../helpers/backoffice';
import { findUserIdByEmail } from '../helpers/auth';
import { cambiarEstadoEscaneo, crearEscaneo } from '../../src/lib/server/escaneos/repo';
import * as repoModule from '../../src/lib/server/escaneos/repo';
import { emitirTokenEscaneo } from '../../src/lib/server/escaneos/api';
import { logger } from '../../src/lib/server/logger';
import { resetEscaneoRateLimits } from '../../src/lib/server/api/escaneo-rate-limit';
import { GET as getEstado } from '../../src/routes/api/escaneos/[escaneoId]/+server';
import { POST as consentimientoPost } from '../../src/routes/api/escaneos/[escaneoId]/consentimiento/+server';
import { POST as estadoPost } from '../../src/routes/api/escaneos/[escaneoId]/estado/+server';
import { POST as dispositivosPost } from '../../src/routes/api/escaneos/[escaneoId]/dispositivos/+server';

const FACU = 'facu@serviciosysistemas.com.ar';
const VERSION = '1.0.0';
const IP = '10.62.0.1';

/**
 * #60 T10 — GET de estado, consentimiento, transiciones, versión del agente,
 * rate limit del resto de endpoints y observabilidad.
 * Cubre R10, R11, R12, R16, R17, R18, R19, R20, R21, R24, R29, R30.
 */
describe('escaneos API — estado, consentimiento y versión', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
    resetEscaneoRateLimits();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function fixtures(razonSocial: string, opts?: { conConsentimiento?: boolean }) {
    const conConsentimiento = opts?.conConsentimiento ?? true;
    const { auditId, clientId: empresaId } = await insertTestAuditRow(sql, { razonSocial });
    const tecnicoId = await findUserIdByEmail(sql, FACU);
    const esc = await crearEscaneo(empresaId, tecnicoId, {
      auditId,
      etiqueta: 'VLAN administración',
      rangoObjetivo: '192.168.10.0/24',
      agenteVersion: VERSION,
      ...(conConsentimiento
        ? {
            consentimientoPor: 'CTO del cliente',
            consentimientoAt: new Date('2026-08-20T10:00:00Z')
          }
        : {})
    });
    const { token } = await emitirTokenEscaneo(esc.id, tecnicoId);
    return { auditId, empresaId, tecnicoId, escaneoId: esc.id, token };
  }

  function agentRequest(
    escaneoId: string,
    token: string | undefined,
    version: string | undefined,
    extraHeaders: Record<string, string> = {}
  ): Request {
    const headers: Record<string, string> = { ...extraHeaders };
    if (token !== undefined) headers.Authorization = `Bearer ${token}`;
    if (version !== undefined) headers['X-Agente-Version'] = version;
    return new Request(`http://localhost/api/escaneos/${escaneoId}`, { headers });
  }

  // version null = omitir el header (un default de TS se aplicaría con undefined)
  function getEstadoCon(escaneoId: string, token?: string, version: string | null = VERSION) {
    return getEstado({
      request: agentRequest(escaneoId, token, version ?? undefined),
      params: { escaneoId },
      getClientAddress: () => IP
    } as never);
  }

  function postEstado(escaneoId: string, token: string, body: unknown) {
    return estadoPost({
      request: new Request(`http://localhost/api/escaneos/${escaneoId}/estado`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Agente-Version': VERSION
        },
        body: JSON.stringify(body)
      }),
      params: { escaneoId },
      getClientAddress: () => IP
    } as never);
  }

  function postConsentimiento(escaneoId: string, token: string, body: unknown) {
    return consentimientoPost({
      request: new Request(`http://localhost/api/escaneos/${escaneoId}/consentimiento`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Agente-Version': VERSION
        },
        body: JSON.stringify(body)
      }),
      params: { escaneoId },
      getClientAddress: () => IP
    } as never);
  }

  it('GET estado devuelve el estado y el contexto empresa/auditoría (R11)', async () => {
    const { escaneoId, token, auditId } = await fixtures('Estado Contexto SA', undefined);

    const res = await getEstadoCon(escaneoId, token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.estado).toBe('pendiente');
    expect(body.data.dispositivosDetectados).toBe(0);
    expect(body.data.consentimientoOtorgado).toBe(true);
    expect(body.data.etiqueta).toBe('VLAN administración');
    expect(body.data.rangoObjetivo).toBe('192.168.10.0/24');
    expect(body.data.iniciadoAt).toBeNull();
    expect(body.data.finalizadoAt).toBeNull();
    expect(body.data.empresa.razonSocial).toBe('Estado Contexto SA');
    expect(body.data.auditoria.id).toBe(auditId);

    const [audit] = await sql<{ ref_code: string; codigo: string }[]>`
      SELECT a.ref_code, em.codigo
      FROM audit a JOIN empresa em ON em.id = a.empresa_id
      WHERE a.id = ${auditId}
    `;
    expect(body.data.empresa.codigo).toBe(audit.codigo);
    expect(body.data.auditoria.refCode).toBe(audit.ref_code);
  });

  it('en estado terminal: lectura permitida, escrituras rechazadas con 409 (R10)', async () => {
    const { escaneoId, token, empresaId } = await fixtures('Estado Terminal SA', undefined);
    await cambiarEstadoEscaneo(empresaId, escaneoId, 'en_curso');
    await cambiarEstadoEscaneo(empresaId, escaneoId, 'sincronizando');
    await cambiarEstadoEscaneo(empresaId, escaneoId, 'completado');

    const lectura = await getEstadoCon(escaneoId, token);
    expect(lectura.status).toBe(200);
    expect((await lectura.json()).data.estado).toBe('completado');

    const escEstado = await postEstado(escaneoId, token, { estado: 'cancelado' });
    expect(escEstado.status).toBe(409);

    const escConsent = await postConsentimiento(escaneoId, token, {
      consentimientoPor: 'Otro',
      consentimientoAt: new Date().toISOString()
    });
    expect(escConsent.status).toBe(409);

    const escChunk = await dispositivosPost({
      request: new Request(`http://localhost/api/escaneos/${escaneoId}/dispositivos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Agente-Version': VERSION
        },
        body: JSON.stringify({ dispositivos: [{ ip: '10.1.1.1' }] })
      }),
      params: { escaneoId },
      getClientAddress: () => IP
    } as never);
    expect(escChunk.status).toBe(409);
  });

  it('consentimiento: 200 en pendiente y 409 si ya salió de pendiente (R12)', async () => {
    const { escaneoId, token, empresaId } = await fixtures('Consentimiento SA', {
      conConsentimiento: false
    });

    const res = await postConsentimiento(escaneoId, token, {
      consentimientoPor: 'CTO del cliente',
      consentimientoAt: '2026-08-21T15:00:00Z'
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.consentimientoOtorgado).toBe(true);

    await cambiarEstadoEscaneo(empresaId, escaneoId, 'en_curso');

    const tarde = await postConsentimiento(escaneoId, token, {
      consentimientoPor: 'Otro',
      consentimientoAt: '2026-08-22T15:00:00Z'
    });
    expect(tarde.status).toBe(409);
  });

  it('transiciones: en_curso exige consentimiento; pendiente → completado es inválida (R16, R17)', async () => {
    const sinConsent = await fixtures('Transicion Sin Consent SA', { conConsentimiento: false });

    const sinConsentRes = await postEstado(sinConsent.escaneoId, sinConsent.token, {
      estado: 'en_curso'
    });
    expect(sinConsentRes.status).toBe(409);
    // Sin mutar: sigue pendiente
    expect((await (await getEstadoCon(sinConsent.escaneoId, sinConsent.token)).json()).data.estado).toBe(
      'pendiente'
    );

    const directo = await postEstado(sinConsent.escaneoId, sinConsent.token, {
      estado: 'completado'
    });
    expect(directo.status).toBe(409);

    // Con consentimiento: pendiente → en_curso → 200 con iniciadoAt
    const conConsent = await fixtures('Transicion Feliz SA', undefined);
    const ok = await postEstado(conConsent.escaneoId, conConsent.token, { estado: 'en_curso' });
    expect(ok.status).toBe(200);
    const data = (await ok.json()).data;
    expect(data.estado).toBe('en_curso');
    expect(data.iniciadoAt).not.toBeNull();
  });

  it('fallido sin errorDetalle → 400 sin mutar; con detalle → 200 (R18)', async () => {
    const { escaneoId, token, empresaId } = await fixtures('Fallido Detalle SA', undefined);
    await cambiarEstadoEscaneo(empresaId, escaneoId, 'en_curso');

    const sinDetalle = await postEstado(escaneoId, token, { estado: 'fallido' });
    expect(sinDetalle.status).toBe(400);
    expect((await (await getEstadoCon(escaneoId, token)).json()).data.estado).toBe('en_curso');

    const conDetalle = await postEstado(escaneoId, token, {
      estado: 'fallido',
      errorDetalle: 'El agente perdió conectividad con la red objetivo'
    });
    expect(conDetalle.status).toBe(200);
    const data = (await conDetalle.json()).data;
    expect(data.estado).toBe('fallido');
    expect(data.finalizadoAt).not.toBeNull();

    const [row] = await sql<{ error_detalle: string }[]>`
      SELECT error_detalle FROM escaneo WHERE id = ${escaneoId}
    `;
    expect(row.error_detalle).toBe('El agente perdió conectividad con la red objetivo');
  });

  it('estado inválido en el body → 400 (R16)', async () => {
    const { escaneoId, token } = await fixtures('Estado Body Invalido SA', undefined);
    const res = await postEstado(escaneoId, token, { estado: 'pausado' });
    expect(res.status).toBe(400);
  });

  it('X-Agente-Version: falta o inválido → 400; major distinto → 409 (R19, R20)', async () => {
    const { escaneoId, token } = await fixtures('Version Guard SA', undefined);

    const sinHeader = await getEstadoCon(escaneoId, token, null);
    expect(sinHeader.status).toBe(400);

    const invalida = await getEstadoCon(escaneoId, token, 'no-es-semver');
    expect(invalida.status).toBe(400);

    const majorDistinto = await getEstadoCon(escaneoId, token, '2.0.0');
    expect(majorDistinto.status).toBe(409);
    expect((await majorDistinto.json()).error).toContain('actualice el agente');
  });

  it('versión distinta se persiste junto al hostname (R21)', async () => {
    const { escaneoId, token } = await fixtures('Version Persiste SA', undefined);

    const res = await getEstado({
      request: agentRequest(escaneoId, token, '1.9.9', { 'X-Agente-Hostname': 'notebook-facu' }),
      params: { escaneoId },
      getClientAddress: () => IP
    } as never);
    expect(res.status).toBe(200);

    const [row] = await sql<{ agente_version: string; agente_hostname: string | null }[]>`
      SELECT agente_version, agente_hostname FROM escaneo WHERE id = ${escaneoId}
    `;
    expect(row.agente_version).toBe('1.9.9');
    expect(row.agente_hostname).toBe('notebook-facu');
  });

  it('61 GETs en un minuto con el mismo token → 429 (R24)', async () => {
    const { escaneoId, token } = await fixtures('Rate Limit Get SA', undefined);

    let ultimo = 0;
    for (let i = 0; i < 61; i++) {
      const res = await getEstadoCon(escaneoId, token);
      ultimo = res.status;
      if (i < 60) {
        expect(res.status).toBe(200);
      }
    }
    expect(ultimo).toBe(429);
  });

  it('error inesperado del repo → 500 genérico sin stack ni detalle al cliente (R29)', async () => {
    const { escaneoId, token } = await fixtures('Error Interno SA', undefined);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(repoModule, 'obtenerEscaneo').mockRejectedValueOnce(
      new Error('boom: syntax error at or near "escaneo" SQL')
    );

    const res = await getEstadoCon(escaneoId, token);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, data: null, error: 'Error interno' });
    expect(JSON.stringify(body)).not.toContain('boom');
    expect(JSON.stringify(body)).not.toContain('SQL');
    // Log server-side con el error, sin exponerlo al cliente
    expect(errorSpy).toHaveBeenCalled();
  });

  it('logs de auth fallida registran IP y motivo, nunca el token (R30)', async () => {
    const { escaneoId } = await fixtures('Log Sin Token SA', undefined);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const tokenSecreto = 'token-secreto-que-no-debe-loguearse-123';

    const res = await getEstado({
      request: agentRequest(escaneoId, tokenSecreto, VERSION),
      params: { escaneoId },
      getClientAddress: () => '10.62.30.7'
    } as never);
    expect(res.status).toBe(401);

    expect(warnSpy).toHaveBeenCalled();
    const logged = JSON.stringify(warnSpy.mock.calls);
    expect(logged).toContain('10.62.30.7');
    expect(logged).toContain('not_found');
    expect(logged).not.toContain(tokenSecreto);
    // La respuesta tampoco lo expone
    expect(JSON.stringify(await res.json())).not.toContain(tokenSecreto);
  });
});
