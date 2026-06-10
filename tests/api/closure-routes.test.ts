import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { load as closureLoad } from '../../src/routes/(app)/auditorias/[id]/cierre/+page.server';
import type { ClosureLoadResult } from '../../src/lib/server/closure/load-closure';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedClosureAuditFixture } from '../fixtures/closure-audit';
import type postgres from 'postgres';

describe('closure routes', () => {
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

  it('staff with matching specialty can load closure page', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre' });
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const erpTech = await findUserByEmail(sql, 'simon@serviciosysistemas.com.ar');

    const techData = (await closureLoad({
      params: { id: auditId },
      locals: { user: tech }
    } as never)) as ClosureLoadResult;
    expect(techData.audit.id).toBe(auditId);

    const adminData = (await closureLoad({
      params: { id: auditId },
      locals: { user: admin }
    } as never)) as ClosureLoadResult;
    expect(adminData.indices.it).not.toBeNull();

    await expect(
      closureLoad({ params: { id: auditId }, locals: { user: erpTech } } as never)
    ).rejects.toThrow();
  });

  it('closed audit closure page read-only except admin reopen', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'cerrada' });
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const techView = (await closureLoad({
      params: { id: auditId },
      locals: { user: tech }
    } as never)) as ClosureLoadResult;
    expect(techView.readonly).toBe(true);
    expect(techView.isAdmin).toBe(false);

    const adminView = (await closureLoad({
      params: { id: auditId },
      locals: { user: admin }
    } as never)) as ClosureLoadResult;
    expect(adminView.readonly).toBe(true);
    expect(adminView.isAdmin).toBe(true);
  });
});
