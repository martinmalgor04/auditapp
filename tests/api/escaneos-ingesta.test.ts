import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { insertTestAuditRow } from '../helpers/backoffice';
import { findUserIdByEmail } from '../helpers/auth';
import { cambiarEstadoEscaneo, crearEscaneo } from '../../src/lib/server/escaneos/repo';
import { emitirTokenEscaneo } from '../../src/lib/server/escaneos/api';
import { resetEscaneoRateLimits } from '../../src/lib/server/api/escaneo-rate-limit';
import { POST as dispositivosPost } from '../../src/routes/api/escaneos/[escaneoId]/dispositivos/+server';
import { GET as getEstado } from '../../src/routes/api/escaneos/[escaneoId]/+server';

const FACU = 'facu@serviciosysistemas.com.ar';
const VERSION = '1.0.0';

/**
 * #60 T9 — ingesta de dispositivos: chunks, idempotencia, límites de tamaño,
 * rate limits y mismatch path↔token. Cubre R9, R13, R14, R15, R23, R25.
 */
describe('escaneos API — ingesta de dispositivos', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
    resetEscaneoRateLimits();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  /** Escaneo en_curso con consentimiento + token emitido (fixture vía módulos). */
  async function fixtures(razonSocial: string) {
    const { auditId, clientId: empresaId } = await insertTestAuditRow(sql, { razonSocial });
    const tecnicoId = await findUserIdByEmail(sql, FACU);
    const esc = await crearEscaneo(empresaId, tecnicoId, {
      auditId,
      rangoObjetivo: '192.168.10.0/24',
      agenteVersion: VERSION,
      consentimientoPor: 'CTO del cliente',
      consentimientoAt: new Date('2026-08-20T10:00:00Z')
    });
    await cambiarEstadoEscaneo(empresaId, esc.id, 'en_curso');
    const { token } = await emitirTokenEscaneo(esc.id, tecnicoId);
    return { auditId, empresaId, tecnicoId, escaneoId: esc.id, token };
  }

  function postChunk(
    escaneoId: string,
    token: string,
    body: unknown,
    opts: { ip?: string; contentLength?: number } = {}
  ) {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Agente-Version': VERSION,
      'Content-Length': String(opts.contentLength ?? Buffer.byteLength(raw))
    };
    return dispositivosPost({
      request: new Request(`http://localhost/api/escaneos/${escaneoId}/dispositivos`, {
        method: 'POST',
        headers,
        body: raw
      }),
      params: { escaneoId },
      getClientAddress: () => opts.ip ?? '10.61.0.1'
    } as never);
  }

  async function conteos(escaneoId: string) {
    const [row] = await sql<{ dispositivos: number; software: number; servicios: number }[]>`
      SELECT
        (SELECT count(*)::int FROM escaneo_dispositivo WHERE escaneo_id = ${escaneoId}) AS dispositivos,
        (SELECT count(*)::int FROM escaneo_software s
           JOIN escaneo_dispositivo d ON d.id = s.dispositivo_id
          WHERE d.escaneo_id = ${escaneoId}) AS software,
        (SELECT count(*)::int FROM escaneo_servicio s
           JOIN escaneo_dispositivo d ON d.id = s.dispositivo_id
          WHERE d.escaneo_id = ${escaneoId}) AS servicios
    `;
    return row;
  }

  const CHUNK = {
    dispositivos: [
      {
        mac: 'AA:BB:CC:DD:EE:01',
        ip: '192.168.10.5',
        hostname: 'srv-01',
        tipo: 'servidor',
        soNombre: 'Debian 12',
        software: [{ nombre: 'nginx', version: '1.24', publisher: 'nginx.org' }],
        servicios: [{ puerto: 443, protocolo: 'tcp', estadoPuerto: 'open', servicio: 'https' }]
      },
      { ip: '192.168.10.44' }
    ]
  };

  it('chunk válido persiste dispositivos, software y servicios, y responde el conteo (R13)', async () => {
    const { escaneoId, token } = await fixtures('Ingesta Feliz SA');

    const res = await postChunk(escaneoId, token, CHUNK);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ recibidos: 2, dispositivosDetectados: 2 });

    const c = await conteos(escaneoId);
    expect(c).toEqual({ dispositivos: 2, software: 1, servicios: 1 });

    const [dev] = await sql<{ hostname: string; tipo: string; mac: string }[]>`
      SELECT hostname, tipo, mac FROM escaneo_dispositivo
      WHERE escaneo_id = ${escaneoId} AND ip = '192.168.10.5'
    `;
    expect(dev.hostname).toBe('srv-01');
    expect(dev.tipo).toBe('servidor');
    expect(dev.mac).toBe('aabbccddee01');
  });

  it('reenvío del mismo chunk produce el mismo estado final sin duplicados (R14)', async () => {
    const { escaneoId, token } = await fixtures('Ingesta Idempotente SA');

    const primero = await postChunk(escaneoId, token, CHUNK);
    expect(primero.status).toBe(200);

    const segundo = await postChunk(escaneoId, token, CHUNK);
    expect(segundo.status).toBe(200);
    const body = await segundo.json();
    expect(body.data).toEqual({ recibidos: 2, dispositivosDetectados: 2 });

    const c = await conteos(escaneoId);
    expect(c).toEqual({ dispositivos: 2, software: 1, servicios: 1 });
  });

  it('chunk de 101 dispositivos o vacío → 400 sin escrituras (R15)', async () => {
    const { escaneoId, token } = await fixtures('Ingesta Limites SA');

    const vacio = await postChunk(escaneoId, token, { dispositivos: [] });
    expect(vacio.status).toBe(400);

    const grande = {
      dispositivos: Array.from({ length: 101 }, (_, i) => ({ ip: `10.9.0.${(i % 250) + 1}` }))
    };
    const res = await postChunk(escaneoId, token, grande);
    expect(res.status).toBe(400);

    expect((await conteos(escaneoId)).dispositivos).toBe(0);
  });

  it('body mayor a 2 MB → 400 sin parsear ni escribir (R15)', async () => {
    const { escaneoId, token } = await fixtures('Ingesta Body Grande SA');

    const relleno = 'x'.repeat(2 * 1024 * 1024);
    const body = JSON.stringify({ dispositivos: [{ ip: '10.9.9.1', raw: { notas: relleno } }] });
    expect(Buffer.byteLength(body)).toBeGreaterThan(2 * 1024 * 1024);

    const res = await postChunk(escaneoId, token, body);
    expect(res.status).toBe(400);
    expect((await conteos(escaneoId)).dispositivos).toBe(0);
  });

  it('31 chunks en un minuto con el mismo token → el 31 da 429 (R23)', async () => {
    const { escaneoId, token } = await fixtures('Ingesta Rate Limit SA');
    const chunkMinimo = { dispositivos: [{ ip: '10.8.0.1' }] };

    for (let i = 0; i < 30; i++) {
      const res = await postChunk(escaneoId, token, chunkMinimo, { ip: '10.61.23.1' });
      expect(res.status).toBe(200);
    }

    const excedido = await postChunk(escaneoId, token, chunkMinimo, { ip: '10.61.23.1' });
    expect(excedido.status).toBe(429);
  });

  it('11 fallos de auth desde una IP → 429 (R25)', async () => {
    const { escaneoId } = await fixtures('Ingesta Auth Fails SA');
    const ip = '10.61.25.9';

    let ultimo = 0;
    for (let i = 0; i < 11; i++) {
      const res = await getEstado({
        request: new Request(`http://localhost/api/escaneos/${escaneoId}`, {
          headers: { Authorization: 'Bearer token-invalido', 'X-Agente-Version': VERSION }
        }),
        params: { escaneoId },
        getClientAddress: () => ip
      } as never);
      ultimo = res.status;
      if (i < 10) {
        expect(res.status).toBe(401);
      }
    }
    expect(ultimo).toBe(429);
  });

  it('path escaneoId ≠ token → 404 idéntico a escaneo inexistente (R9)', async () => {
    const a = await fixtures('Ingesta Mismatch A SA');
    const b = await fixtures('Ingesta Mismatch B SA');

    // Token de A contra path de B: 404, sin confirmar existencia de B
    const mismatch = await getEstado({
      request: new Request(`http://localhost/api/escaneos/${b.escaneoId}`, {
        headers: { Authorization: `Bearer ${a.token}`, 'X-Agente-Version': VERSION }
      }),
      params: { escaneoId: b.escaneoId },
      getClientAddress: () => '10.61.9.1'
    } as never);
    expect(mismatch.status).toBe(404);

    const idInexistente = randomUUID();
    const inexistente = await getEstado({
      request: new Request(`http://localhost/api/escaneos/${idInexistente}`, {
        headers: { Authorization: `Bearer ${a.token}`, 'X-Agente-Version': VERSION }
      }),
      params: { escaneoId: idInexistente },
      getClientAddress: () => '10.61.9.1'
    } as never);
    // mismatch e inexistente responden idéntico (R9: sin confirmar existencia ajena)
    expect(inexistente.status).toBe(404);
    expect(await mismatch.json()).toEqual(await inexistente.json());

    // El token de A sigue funcionando sobre A (el 404 no lo invalida)
    const propio = await getEstado({
      request: new Request(`http://localhost/api/escaneos/${a.escaneoId}`, {
        headers: { Authorization: `Bearer ${a.token}`, 'X-Agente-Version': VERSION }
      }),
      params: { escaneoId: a.escaneoId },
      getClientAddress: () => '10.61.9.1'
    } as never);
    expect(propio.status).toBe(200);
  });
});
