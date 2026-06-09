import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { completeRelevamiento } from '../../src/lib/server/form/complete';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedAuditFormFixture } from '../fixtures/audit-form';
import type postgres from 'postgres';

describe('closure transition', () => {
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

  it('entering en_cierre persists section scores and indices', async () => {
    const { auditId } = await seedAuditFormFixture(sql, { status: 'en_relevamiento' });
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    await completeRelevamiento(auditId, tech!);

    const [audit] = await sql<{ status: string }[]>`
      SELECT status FROM audit WHERE id = ${auditId}
    `;
    expect(audit.status).toBe('en_cierre');

    const scores = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM audit_section_score WHERE audit_id = ${auditId}
    `;
    expect(Number(scores[0].count)).toBeGreaterThan(0);

    const [closure] = await sql<{ indice_it: number | null }[]>`
      SELECT indice_it FROM audit_closure WHERE audit_id = ${auditId}
    `;
    expect(closure.indice_it).not.toBeNull();
  });
});
