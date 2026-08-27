import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { insertTestAuditRow } from '../helpers/backoffice';
import { findUserIdByEmail } from '../helpers/auth';
import { cambiarEstadoEscaneo, crearEscaneo } from '../../src/lib/server/escaneos/repo';
import { ERROR_DETALLE_COLGADO } from '../../src/lib/server/escaneos/jobs';
import { resetEscaneoRateLimits } from '../../src/lib/server/api/escaneo-rate-limit';
import { POST as colgadosPost } from '../../src/routes/api/system/escaneos-colgados/+server';

const FACU = 'facu@serviciosysistemas.com.ar';
const SYSTEM_TOKEN = 'test-escaneo-system-token';

/**
 * #60 T11 — job de escaneos colgados (R7 de #59) vía endpoint de sistema.
 * Cubre R26, R27, R28.
 */
describe('escaneos API — job de escaneos colgados', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
    resetEscaneoRateLimits();
    process.env.ESCANEO_SYSTEM_TOKEN = SYSTEM_TOKEN;
  });

  afterEach(() => {
    delete process.env.ESCANEO_SYSTEM_TOKEN;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  function invocar(token?: string, ip = '10.63.0.1') {
    const headers: Record<string, string> = {};
    if (token !== undefined) {
      headers.Authorization = `Bearer ${token}`;
    }
    return colgadosPost({
      request: new Request('http://localhost/api/system/escaneos-colgados', {
        method: 'POST',
        headers
      }),
      getClientAddress: () => ip
    } as never);
  }

  /** Escaneo en_curso; `horasSinActividad` retrocede updated_at para el job. */
  async function escaneoEnCurso(razonSocial: string, horasSinActividad: number) {
    const { auditId, clientId: empresaId } = await insertTestAuditRow(sql, { razonSocial });
    const tecnicoId = await findUserIdByEmail(sql, FACU);
    const esc = await crearEscaneo(empresaId, tecnicoId, {
      auditId,
      rangoObjetivo: '192.168.20.0/24',
      agenteVersion: '1.0.0',
      consentimientoPor: 'CTO del cliente',
      consentimientoAt: new Date('2026-08-20T10:00:00Z')
    });
    await cambiarEstadoEscaneo(empresaId, esc.id, 'en_curso');
    await sql`
      UPDATE escaneo SET updated_at = now() - (${horasSinActividad} * interval '1 hour')
      WHERE id = ${esc.id}
    `;
    return { escaneoId: esc.id, empresaId };
  }

  it('401 sin token, con token incorrecto y fail-closed sin env configurada (R27)', async () => {
    expect((await invocar()).status).toBe(401);
    expect((await invocar('token-incorrecto')).status).toBe(401);

    delete process.env.ESCANEO_SYSTEM_TOKEN;
    expect((await invocar(SYSTEM_TOKEN)).status).toBe(401);
  });

  it('marca fallido solo los colgados >24 h, con error_detalle descriptivo (R26)', async () => {
    const colgado = await escaneoEnCurso('Colgado SA', 25);
    const activo = await escaneoEnCurso('Activo SA', 2);

    // Pendiente viejo NO es candidato (el job solo mira en_curso/sincronizando)
    const { auditId, clientId: empresaPendiente } = await insertTestAuditRow(sql, {
      razonSocial: 'Pendiente Viejo SA'
    });
    const tecnicoId = await findUserIdByEmail(sql, FACU);
    const pendiente = await crearEscaneo(empresaPendiente, tecnicoId, {
      auditId,
      rangoObjetivo: '10.5.0.0/24',
      agenteVersion: '1.0.0'
    });
    await sql`
      UPDATE escaneo SET updated_at = now() - interval '30 hours' WHERE id = ${pendiente.id}
    `;

    const res = await invocar(SYSTEM_TOKEN);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ marcados: 1 });

    const ids = [colgado.escaneoId, activo.escaneoId, pendiente.id];
    const estados = await sql<
      { id: string; estado: string; error_detalle: string | null; finalizado_at: Date | null }[]
    >`
      SELECT id, estado, error_detalle, finalizado_at FROM escaneo
      WHERE id = ANY(${ids}::uuid[])
      ORDER BY id
    `;
    const porId = new Map(estados.map((e) => [e.id, e]));

    expect(porId.get(colgado.escaneoId)?.estado).toBe('fallido');
    expect(porId.get(colgado.escaneoId)?.error_detalle).toBe(ERROR_DETALLE_COLGADO);
    expect(porId.get(colgado.escaneoId)?.finalizado_at).not.toBeNull();

    expect(porId.get(activo.escaneoId)?.estado).toBe('en_curso');
    expect(porId.get(activo.escaneoId)?.error_detalle).toBeNull();

    expect(porId.get(pendiente.id)?.estado).toBe('pendiente');
  });

  it('segunda corrida sin actividad intermedia marca cero (R28)', async () => {
    await escaneoEnCurso('Colgado Idempotente SA', 26);

    const primera = await invocar(SYSTEM_TOKEN);
    expect((await primera.json()).data).toEqual({ marcados: 1 });

    const segunda = await invocar(SYSTEM_TOKEN);
    expect(segunda.status).toBe(200);
    expect((await segunda.json()).data).toEqual({ marcados: 0 });
  });
});
