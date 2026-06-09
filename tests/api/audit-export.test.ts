import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { CANONICAL_SCHEMA_VERSION } from '../../src/lib/server/canonical/version';
import { GET as exportGet } from '../../src/routes/api/audits/[id]/export/+server';
import { seedCanonicalAuditFixture } from '../fixtures/canonical-audit';
import { seedClosureAuditFixture } from '../fixtures/closure-audit';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import type postgres from 'postgres';

function adminLocals(user: NonNullable<Awaited<ReturnType<typeof findUserByEmail>>>) {
  return { user };
}

describe('audit export API', () => {
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

  it('GET export returns canonical JSON for admin', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const response = await exportGet({
      params: { id: auditId },
      locals: adminLocals(admin!)
    } as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.schema_version).toBe(CANONICAL_SCHEMA_VERSION);
    expect(body.audit_id).toBe(auditId);
    expect(body.success).toBeUndefined();
  });

  it('response includes X-Schema-Version header', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const response = await exportGet({
      params: { id: auditId },
      locals: adminLocals(admin!)
    } as never);

    expect(response.headers.get('X-Schema-Version')).toBe(CANONICAL_SCHEMA_VERSION);
  });

  it('returns 401 without session', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);

    const response = await exportGet({
      params: { id: auditId },
      locals: { user: null }
    } as never);

    expect(response.status).toBe(401);
  });

  it('returns 403 for tecnico role', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    const response = await exportGet({
      params: { id: auditId },
      locals: adminLocals(tech!)
    } as never);

    expect(response.status).toBe(403);
  });

  it('returns 409 when audit not closed', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre' });
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const response = await exportGet({
      params: { id: auditId },
      locals: adminLocals(admin!)
    } as never);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.audit_id).toBeUndefined();
  });
});
