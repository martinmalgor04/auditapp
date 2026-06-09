import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { computeLiveScores } from '../../src/lib/server/scoring/live';
import { recalculateAndPersistScores } from '../../src/lib/server/scoring/persist';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { seedMinimalScoringAudit } from '../fixtures/closure-audit';
import type postgres from 'postgres';

describe('live score', () => {
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

  it('computeLiveScores matches full engine on same input', async () => {
    const { auditId } = await seedMinimalScoringAudit(sql);
    const live = await computeLiveScores(auditId);
    const persisted = await recalculateAndPersistScores(auditId);

    expect(live.indiceIt).toBe(persisted.indiceIt);
    expect(live.indiceErp).toBe(persisted.indiceErp);
    expect(live.sectionScores.length).toBe(persisted.sectionScores.length);
  });
});
