import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { seedReportForShare } from '../fixtures/informe-share';
import { createReportShare } from '../../src/lib/server/informe/share';
import { insertSurveyResponse } from '../../src/lib/server/db/survey-responses';
import { load as backofficeLoad } from '../../src/routes/(app)/auditorias/[id]/informe/[version]/+page.server';
import type { AppUser } from '../../src/lib/server/auth/types';
import type { SurveyState } from '../../src/lib/server/informe/survey';

function ctx(auditId: string, version: number, user: AppUser) {
  return {
    locals: { user } as never,
    params: { id: auditId, version: String(version) }
  };
}

type AdminLoad = { encuesta: SurveyState | null; isAdmin: boolean };

describe('encuesta de conformidad — backoffice (R9)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  }, 30_000);

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('el load admin devuelve la respuesta de la encuesta (R9)', async () => {
    const { auditId, reportId, version, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });
    await insertSurveyResponse({
      shareId: share.id,
      valoracionGlobal: 5,
      claridadInforme: 4,
      conformeHallazgos: true,
      comentario: 'Todo claro'
    });

    const data = (await backofficeLoad(ctx(auditId, version, admin) as never)) as AdminLoad;
    expect(data.isAdmin).toBe(true);
    expect(data.encuesta?.estado).toBe('respondida');
    if (data.encuesta?.estado === 'respondida') {
      expect(data.encuesta.respuesta.valoracion_global).toBe(5);
      expect(data.encuesta.respuesta.claridad_informe).toBe(4);
      expect(data.encuesta.respuesta.conforme_hallazgos).toBe(true);
      expect(data.encuesta.respuesta.comentario).toBe('Todo claro');
      expect(data.encuesta.respuesta.submitted_at).toBeTruthy();
    }
  });

  it('sin respuesta → estado pendiente (sin respuesta aún) (R9)', async () => {
    const { auditId, reportId, version, admin } = await seedReportForShare(sql, 'aprobado');
    await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });

    const data = (await backofficeLoad(ctx(auditId, version, admin) as never)) as AdminLoad;
    expect(data.encuesta).toEqual({ estado: 'pendiente' });
  });

  it('un técnico no asignado no ve la encuesta (403) (R9)', async () => {
    const { auditId, reportId, version, admin, tech } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });
    await insertSurveyResponse({
      shareId: share.id,
      valoracionGlobal: 3,
      claridadInforme: 3,
      conformeHallazgos: false,
      comentario: null
    });

    await expect(backofficeLoad(ctx(auditId, version, tech) as never)).rejects.toMatchObject({
      status: expect.any(Number)
    });
  });
});
