import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedCanonicalAuditFixture } from '../fixtures/canonical-audit';
import { seedClosureAuditFixture } from '../fixtures/closure-audit';
import { GET as listGet, POST as createPost } from '../../src/routes/api/audits/[id]/report/+server';
import { setInformeAdapterForTests } from '../../src/lib/server/informe/claude';
import { mockAdapterHanging, mockAdapterValid } from '../fixtures/informe-claude-mock';
import { CANONICAL_SCHEMA_VERSION } from '../../src/lib/server/canonical/version';

function locals(user: unknown) {
  return { user } as never;
}

async function countReports(sql: postgres.Sql): Promise<number> {
  const [row] = await sql<{ count: string }[]>`SELECT count(*) FROM audit_report`;
  return Number(row.count);
}

describe('informe create API', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
    process.env.ANTHROPIC_API_KEY = 'test-key';
    setInformeAdapterForTests(mockAdapterHanging());
  });

  afterEach(() => {
    setInformeAdapterForTests(undefined);
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('401 sin sesión, 403 tecnico, 201 admin (R1)', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    const noSession = await createPost({ params: { id: auditId }, locals: locals(null) } as never);
    expect(noSession.status).toBe(401);

    const techRes = await createPost({ params: { id: auditId }, locals: locals(tech) } as never);
    expect(techRes.status).toBe(403);

    const adminRes = await createPost({ params: { id: auditId }, locals: locals(admin) } as never);
    expect(adminRes.status).toBe(201);
  });

  it('auditoría en_cierre retorna 409 sin crear fila (R2)', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre' });
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const before = await countReports(sql);

    const res = await createPost({ params: { id: auditId }, locals: locals(admin) } as never);

    expect(res.status).toBe(409);
    expect(await countReports(sql)).toBe(before);
  });

  it('sin ANTHROPIC_API_KEY retorna 503 sin crear fila (R3)', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    delete process.env.ANTHROPIC_API_KEY;
    const before = await countReports(sql);

    const res = await createPost({ params: { id: auditId }, locals: locals(admin) } as never);

    expect(res.status).toBe(503);
    expect(await countReports(sql)).toBe(before);
  });

  it('versiones 1 y 2 con snapshot schema_version 1.0; respuesta inmediata pendiente (R4, R6, R21)', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    // Mock colgado: si la respuesta llega, no esperó al pipeline (R6).
    const first = await createPost({ params: { id: auditId }, locals: locals(admin) } as never);
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.data.version).toBe(1);
    expect(firstBody.data.status).toBe('pendiente');

    // Simula v1 terminada en borrador con draft propio (regenerar no la toca, R21)
    await sql`
      UPDATE audit_report
      SET status = 'borrador', client_draft = '{"marker": "v1-original"}'::jsonb
      WHERE id = ${firstBody.data.report_id}
    `;

    const second = await createPost({ params: { id: auditId }, locals: locals(admin) } as never);
    const secondBody = await second.json();
    expect(secondBody.data.version).toBe(2);

    const rows = await sql<{ version: number; schema_version: string; client_draft: unknown }[]>`
      SELECT version, schema_version, client_draft
      FROM audit_report WHERE audit_id = ${auditId} ORDER BY version
    `;
    expect(rows).toHaveLength(2);
    expect(rows[0].schema_version).toBe(CANONICAL_SCHEMA_VERSION);
    expect(rows[1].schema_version).toBe(CANONICAL_SCHEMA_VERSION);
    expect(rows[0].client_draft).toEqual({ marker: 'v1-original' });

    const [snapshot] = await sql<{ canonical_json: { schema_version: string } }[]>`
      SELECT canonical_json FROM audit_report WHERE audit_id = ${auditId} AND version = 1
    `;
    expect(snapshot.canonical_json.schema_version).toBe(CANONICAL_SCHEMA_VERSION);
  });

  it('GET listado devuelve versiones ordenadas (R27)', async () => {
    setInformeAdapterForTests(mockAdapterValid());
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    await createPost({ params: { id: auditId }, locals: locals(admin) } as never);
    await createPost({ params: { id: auditId }, locals: locals(admin) } as never);

    const res = await listGet({ params: { id: auditId }, locals: locals(admin) } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.map((r: { version: number }) => r.version)).toEqual([2, 1]);
  });
});
