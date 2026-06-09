import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { completeRelevamiento } from '../../src/lib/server/form/complete';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedAuditFormFixture } from '../fixtures/audit-form';
import type postgres from 'postgres';

describe('audit form complete', () => {
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

  it('transitions to en_cierre with warnings for pending required items', async () => {
    const { auditId } = await seedAuditFormFixture(sql, { status: 'en_relevamiento' });
    await sql`UPDATE audit SET status = 'en_relevamiento' WHERE id = ${auditId}`;
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    const result = await completeRelevamiento(auditId, tech!);
    expect(result.status).toBe('en_cierre');
    expect(Array.isArray(result.warnings)).toBe(true);

    const [audit] = await sql<{ status: string }[]>`
      SELECT status FROM audit WHERE id = ${auditId}
    `;
    expect(audit.status).toBe('en_cierre');
  });
});
