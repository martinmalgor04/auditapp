import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { load as closureLoad } from '../../src/routes/(app)/auditorias/[id]/cierre/+page.server';
import type { ClosureLoadResult } from '../../src/lib/server/closure/load-closure';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedClosureAuditFixture } from '../fixtures/closure-audit';
import type postgres from 'postgres';

describe('closure page load', () => {
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

  it('closure load includes indices and section scores', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre' });
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    const data = (await closureLoad({
      params: { id: auditId },
      locals: { user: tech }
    } as never)) as ClosureLoadResult;

    expect(data.indices.it).not.toBeNull();
    expect(data.sections.length).toBeGreaterThan(0);
    expect(data.sections[0].score).not.toBeNull();
  });
});
