import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { BUNDLE_SCHEMA_VERSION } from '../../src/lib/server/bundle/version';
import * as buildModule from '../../src/lib/server/bundle/build';
import { GET as exportGet } from '../../src/routes/api/audits/[id]/bundle/export/+server';
import { seedBundleAuditFixture } from '../fixtures/audit-bundle';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';

function localsFor(user: unknown) {
  return { user };
}

describe('audit bundle export API', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('admin obtiene 200 con bundle válido', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const res = await exportGet({
      params: { id: fx.auditId },
      locals: localsFor(admin)
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bundle_schema_version).toBe(BUNDLE_SCHEMA_VERSION);
    expect(body.dedupe_key.origin_audit_id).toBe(fx.auditId);
    expect(res.headers.get('X-Bundle-Schema-Version')).toBe(BUNDLE_SCHEMA_VERSION);
  });

  it('sin sesión responde 401 y no invoca el builder', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const spy = vi.spyOn(buildModule, 'buildAuditBundle');

    const res = await exportGet({
      params: { id: fx.auditId },
      locals: localsFor(null)
    } as never);

    expect(res.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rol tecnico responde 403 y no invoca el builder', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const spy = vi.spyOn(buildModule, 'buildAuditBundle');

    const res = await exportGet({
      params: { id: fx.auditId },
      locals: localsFor(tech)
    } as never);

    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it('auditoría inexistente responde 404', async () => {
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const res = await exportGet({
      params: { id: '00000000-0000-0000-0000-000000000000' },
      locals: localsFor(admin)
    } as never);
    expect(res.status).toBe(404);
  });
});
