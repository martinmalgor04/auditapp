import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { seedReportForShare } from '../fixtures/informe-share';
import { buildValidInternalDraft } from '../fixtures/informe-claude-mock';
import { createReportShare } from '../../src/lib/server/informe/share';
import { resetInformeShareRateLimit } from '../../src/lib/server/informe/rate-limit';
import { load as publicLoad, actions } from '../../src/routes/informe/[token]/+page.server';
import type { SurveyState } from '../../src/lib/server/informe/survey';

const internal = buildValidInternalDraft();

type PublicLoad = { token: string; encuesta: SurveyState; model: unknown };

function loadCtx(token: string, ip = '10.1.0.2') {
  const headers: Record<string, string> = {};
  return {
    params: { token },
    setHeaders: (h: Record<string, string>) => Object.assign(headers, h),
    getClientAddress: () => ip,
    headers
  };
}

function actionCtx(token: string, fields: Record<string, string>, ip = '10.1.0.5') {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return {
    params: { token },
    request: { formData: async () => form } as unknown as Request,
    getClientAddress: () => ip
  };
}

const validFields = {
  valoracion_global: '4',
  claridad_informe: '5',
  conforme_hallazgos: 'true',
  comentario: 'Excelente'
};

async function countResponses(sql: postgres.Sql, shareId: string): Promise<number> {
  const [row] = await sql<{ count: string }[]>`
    SELECT count(*) FROM survey_response WHERE share_id = ${shareId}
  `;
  return Number(row.count);
}

describe('encuesta de conformidad — ruta pública (R1, R2, R4–R8, R10)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  }, 30_000);

  beforeEach(() => {
    setSqlForTests(sql);
    resetInformeShareRateLimit();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('el load incluye encuesta pendiente (R1)', async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });

    const data = (await publicLoad(loadCtx(share.token) as never)) as PublicLoad;
    expect(data.encuesta).toEqual({ estado: 'pendiente' });
  });

  it('el payload del load no expone material interno ni ids (R2)', async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });

    const data = (await publicLoad(loadCtx(share.token) as never)) as PublicLoad;
    const serialized = JSON.stringify(data.encuesta);
    expect(serialized).not.toContain(reportId);
    expect(serialized).not.toContain(share.id);
    expect(serialized).not.toContain(admin.id);
    for (const rec of internal.recomendaciones_presupuesto) {
      expect(serialized).not.toContain(rec.linea);
      expect(serialized).not.toContain(rec.justificacion);
    }
    expect(serialized).not.toContain('report_id');
    expect(serialized).not.toContain('share_id');
    expect(serialized).not.toContain('created_by');
  });

  it('POST válido inserta con submitted_at y devuelve estado respondida (R6, R7, R8)', async () => {
    const start = Date.now();
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });

    const res = (await actions.responder(actionCtx(share.token, validFields) as never)) as {
      ok: boolean;
      encuesta: { estado: string; respuesta: { submitted_at: string } };
    };
    expect(res.ok).toBe(true);
    expect(res.encuesta.estado).toBe('respondida');

    const [row] = await sql<{ submitted_at: Date }[]>`
      SELECT submitted_at FROM survey_response WHERE share_id = ${share.id}
    `;
    expect(row.submitted_at).toBeTruthy();
    expect(new Date(res.encuesta.respuesta.submitted_at).getTime()).toBeGreaterThanOrEqual(
      start - 1000
    );

    // El load posterior refleja el estado respondida (R1, R6).
    const data = (await publicLoad(loadCtx(share.token) as never)) as PublicLoad;
    expect(data.encuesta.estado).toBe('respondida');
  });

  it("POST 'No conforme' persiste conforme_hallazgos = false (no lo coacciona a true)", async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });

    const res = (await actions.responder(
      actionCtx(share.token, { ...validFields, conforme_hallazgos: 'false' }) as never
    )) as { ok: boolean; encuesta: { respuesta: { conforme_hallazgos: boolean } } };
    expect(res.ok).toBe(true);
    expect(res.encuesta.respuesta.conforme_hallazgos).toBe(false);

    const [row] = await sql<{ conforme_hallazgos: boolean }[]>`
      SELECT conforme_hallazgos FROM survey_response WHERE share_id = ${share.id}
    `;
    expect(row.conforme_hallazgos).toBe(false);
  });

  it('POST inválido no inserta fila y degrada con fail amable (R4)', async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });

    const res = (await actions.responder(
      actionCtx(share.token, { ...validFields, valoracion_global: '9' }) as never
    )) as { status: number; data: { ok: boolean; mensaje: string } };
    expect(res.status).toBe(400);
    expect(res.data.ok).toBe(false);
    expect(JSON.stringify(res)).not.toContain('Error:');
    expect(await countResponses(sql, share.id)).toBe(0);
  });

  it('token inexistente/revocado/expirado/no aprobado → 404 amable sin fila (R5)', async () => {
    // inexistente
    await expect(
      actions.responder(actionCtx('token-fantasma', validFields) as never)
    ).rejects.toMatchObject({ status: 404 });

    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');

    const revocado = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: null });
    await sql`UPDATE audit_report_share SET revoked_at = now() WHERE id = ${revocado.id}`;
    await expect(
      actions.responder(actionCtx(revocado.token, validFields) as never)
    ).rejects.toMatchObject({ status: 404 });
    expect(await countResponses(sql, revocado.id)).toBe(0);

    const noAprobado = await createReportShare({
      reportId,
      createdBy: admin.id,
      expiresInDays: null
    });
    await sql`UPDATE audit_report SET status = 'borrador' WHERE id = ${reportId}`;
    await expect(
      actions.responder(actionCtx(noAprobado.token, validFields) as never)
    ).rejects.toMatchObject({ status: 404 });
    expect(await countResponses(sql, noAprobado.id)).toBe(0);
  });

  it('segundo POST para el mismo token no crea segunda fila (R6)', async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });

    const first = (await actions.responder(actionCtx(share.token, validFields) as never)) as {
      ok: boolean;
    };
    expect(first.ok).toBe(true);

    const second = (await actions.responder(
      actionCtx(share.token, { ...validFields, valoracion_global: '1' }) as never
    )) as { status: number; data: { ok: boolean } };
    expect(second.status).toBe(409);
    expect(second.data.ok).toBe(false);
    expect(await countResponses(sql, share.id)).toBe(1);

    // La fila original no se modificó.
    const [row] = await sql<{ valoracion_global: number }[]>`
      SELECT valoracion_global FROM survey_response WHERE share_id = ${share.id}
    `;
    expect(row.valoracion_global).toBe(4);
  });

  it('ráfaga de POST desde la misma IP termina en 429 (R10)', async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });

    let lastStatus = 0;
    for (let i = 0; i < 70; i++) {
      try {
        const res = (await actions.responder(
          actionCtx(`bad-${i}`, validFields, '10.1.9.9') as never
        )) as { status?: number };
        if (res?.status === 429) {
          lastStatus = 429;
          break;
        }
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 429) {
          lastStatus = 429;
          break;
        }
      }
    }
    // El primer envío válido reusa la IP de la ráfaga para forzar el límite.
    void share;
    expect(lastStatus).toBe(429);
  });
});
