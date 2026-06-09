import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { reopenAudit } from '../../src/lib/server/scoring/persist';
import { ForbiddenError } from '../../src/lib/server/backoffice/errors';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedClosureAuditFixture } from '../fixtures/closure-audit';
import type postgres from 'postgres';

describe('closure reopen', () => {
  let sql: postgres.Sql;
  const token = 'reopen-test-token';

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('admin reopen to en_cierre clears closed fields; tecnico gets 403', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'cerrada', publicToken: token });
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    await reopenAudit(auditId, admin!);

    const [audit] = await sql<{ status: string; public_token: string | null }[]>`
      SELECT status, public_token FROM audit WHERE id = ${auditId}
    `;
    const [closure] = await sql<{ closed_at: Date | null; closed_by: string | null }[]>`
      SELECT closed_at, closed_by FROM audit_closure WHERE audit_id = ${auditId}
    `;

    expect(audit.status).toBe('en_cierre');
    expect(audit.public_token).toBeNull();
    expect(closure.closed_at).toBeNull();
    expect(closure.closed_by).toBeNull();

    await expect(reopenAudit(auditId, tech!)).rejects.toThrow(ForbiddenError);
  });
});
