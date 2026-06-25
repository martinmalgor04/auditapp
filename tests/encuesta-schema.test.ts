import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import {
  columnNames,
  indexNames,
  setupTestDb,
  tableExists,
  teardownTestDb
} from './helpers/db';
import { setSqlForTests } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { seedReportForShare } from './fixtures/informe-share';
import { createReportShare } from '../src/lib/server/informe/share';
import { insertSurveyResponse } from '../src/lib/server/db/survey-responses';
import { surveyResponseSchema } from '../src/lib/server/informe/survey';

describe('encuesta de conformidad — schema y migración (R3, R4, R6)', () => {
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

  it('crea survey_response con columnas e índice único por share_id (R3)', async () => {
    expect(await tableExists(sql, 'survey_response')).toBe(true);

    const cols = await columnNames(sql, 'survey_response');
    expect(cols).toEqual(
      expect.arrayContaining([
        'id',
        'share_id',
        'valoracion_global',
        'claridad_informe',
        'conforme_hallazgos',
        'comentario',
        'submitted_at'
      ])
    );

    const idx = await indexNames(sql, 'survey_response');
    expect(idx).toContain('survey_response_share_uq');
  });

  it('la migración es idempotente: runMigrations dos veces no falla (R3)', async () => {
    const first = await runMigrations(sql);
    expect(first.skipped).toContain('025_encuesta_conformidad');
    const second = await runMigrations(sql);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toContain('025_encuesta_conformidad');
  });

  describe('surveyResponseSchema (R4)', () => {
    const valido = {
      valoracion_global: 4,
      claridad_informe: 5,
      conforme_hallazgos: true,
      comentario: 'Muy claro'
    };

    it('acepta payload válido', () => {
      const r = surveyResponseSchema.safeParse(valido);
      expect(r.success).toBe(true);
    });

    it('coacciona strings de un form (valores 1–5 y booleano)', () => {
      const r = surveyResponseSchema.safeParse({
        valoracion_global: '3',
        claridad_informe: '2',
        conforme_hallazgos: 'true'
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.valoracion_global).toBe(3);
        expect(r.data.conforme_hallazgos).toBe(true);
        expect(r.data.comentario).toBeNull();
      }
    });

    it("parsea conforme_hallazgos 'false' del form como false (no lo coacciona a true)", () => {
      const r = surveyResponseSchema.safeParse({
        valoracion_global: '2',
        claridad_informe: '3',
        conforme_hallazgos: 'false'
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.conforme_hallazgos).toBe(false);
      }
    });

    it('rechaza valoración fuera de rango', () => {
      expect(surveyResponseSchema.safeParse({ ...valido, valoracion_global: 6 }).success).toBe(
        false
      );
      expect(surveyResponseSchema.safeParse({ ...valido, claridad_informe: 0 }).success).toBe(
        false
      );
    });

    it('rechaza campos extra (.strict)', () => {
      expect(
        surveyResponseSchema.safeParse({ ...valido, report_id: 'x', extra: 1 }).success
      ).toBe(false);
    });

    it('rechaza comentario > 2000 chars', () => {
      expect(
        surveyResponseSchema.safeParse({ ...valido, comentario: 'a'.repeat(2001) }).success
      ).toBe(false);
    });

    it('comentario es opcional', () => {
      const r = surveyResponseSchema.safeParse({
        valoracion_global: 1,
        claridad_informe: 1,
        conforme_hallazgos: false
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.comentario).toBeNull();
    });
  });

  it('el índice único rechaza el segundo insert para el mismo share (R6)', async () => {
    const { reportId, admin } = await seedReportForShare(sql, 'aprobado');
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });

    const row = await insertSurveyResponse({
      shareId: share.id,
      valoracionGlobal: 5,
      claridadInforme: 4,
      conformeHallazgos: true,
      comentario: null
    });
    expect(row.submittedAt).toBeTruthy();

    await expect(
      insertSurveyResponse({
        shareId: share.id,
        valoracionGlobal: 1,
        claridadInforme: 1,
        conformeHallazgos: false,
        comentario: null
      })
    ).rejects.toMatchObject({ code: '23505' });
  });
});
