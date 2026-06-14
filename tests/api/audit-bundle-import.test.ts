import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { buildAuditBundle } from '../../src/lib/server/bundle/build';
import { POST as importPost } from '../../src/routes/api/audits/bundle/import/+server';
import { seedBundleAuditFixture } from '../fixtures/audit-bundle';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';

function request(body: unknown, user: unknown) {
  return importPost({
    request: new Request('http://localhost/api/audits/bundle/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    locals: { user }
  } as never);
}

describe('audit bundle import API', () => {
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

  async function countAudits(): Promise<number> {
    const [r] = await sql<{ c: string }[]>`SELECT count(*)::text AS c FROM audit`;
    return Number(r.c);
  }

  it('sin sesión responde 401 y no cambia el conteo de audit', async () => {
    const before = await countAudits();
    const res = await request({ mode: 'dry-run', bundle: {} }, null);
    expect(res.status).toBe(401);
    expect(await countAudits()).toBe(before);
  });

  it('rol tecnico responde 403 y no cambia el conteo', async () => {
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const before = await countAudits();
    const res = await request({ mode: 'dry-run', bundle: {} }, tech);
    expect(res.status).toBe(403);
    expect(await countAudits()).toBe(before);
  });

  it('body inválido (bundle sin schema) responde 400 sin escribir', async () => {
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const before = await countAudits();
    const res = await request({ mode: 'strict', bundle: { nope: true } }, admin);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(await countAudits()).toBe(before);
  });

  it('template faltante en escritura responde 422 con la lista de faltantes', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const bundle = await buildAuditBundle(fx.auditId);
    bundle.header.templates = [{ code: 'noexiste', version: '9.9' }];
    await sql`DELETE FROM audit WHERE id = ${fx.auditId}`;
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const before = await countAudits();
    const res = await request({ mode: 'permissive', bundle }, admin);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(Array.isArray(body.missing)).toBe(true);
    expect(body.missing.some((m: string) => m.includes('noexiste'))).toBe(true);
    expect(await countAudits()).toBe(before);
  });

  it('dry-run responde 200 con report, sin escribir', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const bundle = await buildAuditBundle(fx.auditId);
    await sql`DELETE FROM audit WHERE id = ${fx.auditId}`;
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const before = await countAudits();
    const res = await request({ mode: 'dry-run', bundle }, admin);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.mode).toBe('dry-run');
    expect(body.data.report.would_create).toContain('audit');
    expect(await countAudits()).toBe(before);
  });

  it('default sin mode es dry-run (no escribe, OQ-2)', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const bundle = await buildAuditBundle(fx.auditId);
    await sql`DELETE FROM audit WHERE id = ${fx.auditId}`;
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const before = await countAudits();
    const res = await request({ bundle }, admin);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.mode).toBe('dry-run');
    expect(await countAudits()).toBe(before);
  });

  it('escritura permissive responde 200 y crea la auditoría (+1)', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const bundle = await buildAuditBundle(fx.auditId);
    await sql`DELETE FROM audit WHERE id = ${fx.auditId}`;
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const before = await countAudits();
    const res = await request({ mode: 'permissive', bundle }, admin);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.mode).toBe('permissive');
    expect(body.data.audit_id).toBeTruthy();
    expect(body.data.duplicate).toBe(false);
    expect(await countAudits()).toBe(before + 1);
  });
});
