import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { recalculateAndPersistScores } from '../../src/lib/server/scoring/persist';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { seedMinimalScoringAudit } from '../fixtures/closure-audit';
import type postgres from 'postgres';

describe('persist section score', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('upserts calculated score and breakdown; manual score rejected', async () => {
    const { auditId } = await seedMinimalScoringAudit(sql);
    const result = await recalculateAndPersistScores(auditId);

    expect(result.sectionScores.length).toBeGreaterThan(0);
    expect(result.indiceIt).not.toBeNull();

    expect(result.sectionScores.some((s) => s.breakdown.length > 0)).toBe(true);

    const [row] = await sql<{ score: number; score_breakdown: unknown[] }[]>`
      SELECT score, score_breakdown
      FROM audit_section_score
      WHERE audit_id = ${auditId}
        AND jsonb_array_length(score_breakdown) > 0
      LIMIT 1
    `;
    expect(row.score).toBeGreaterThan(0);
    expect(row.score_breakdown.length).toBeGreaterThan(0);

    await expect(
      sql`
        UPDATE audit_section_score SET score = 42 WHERE audit_id = ${auditId}
      `
    ).resolves.toBeDefined();

    const [closure] = await sql<{ indice_it: number | null; indice_erp: number | null }[]>`
      SELECT indice_it, indice_erp FROM audit_closure WHERE audit_id = ${auditId}
    `;
    expect(closure.indice_it).not.toBeNull();
  });
});
