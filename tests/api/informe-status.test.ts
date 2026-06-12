import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedCanonicalAuditFixture } from '../fixtures/canonical-audit';
import { insertReport } from '../../src/lib/server/db/informe-reports';
import { GET as statusGet } from '../../src/routes/api/audits/[id]/report/[version]/status/+server';
import { loadInformeCanonicalGolden } from '../fixtures/informe-claude-mock';

function locals(user: unknown) {
  return { user } as never;
}

describe('informe status API (R14, R15)', () => {
  let sql: postgres.Sql;
  const golden = loadInformeCanonicalGolden();

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function seedGenerating(updatedAgoMs: number) {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const row = await insertReport({
      auditId,
      canonicalJson: golden,
      schemaVersion: golden.schema_version,
      requestedBy: admin!.id
    });
    await sql`
      UPDATE audit_report
      SET status = 'generando',
          updated_at = now() - (${String(updatedAgoMs)} || ' milliseconds')::interval
      WHERE id = ${row.id}
    `;
    return { auditId, version: row.version, admin: admin! };
  }

  it('devuelve el estado por versión (R15)', async () => {
    const { auditId, version, admin } = await seedGenerating(1000);
    const res = await statusGet({
      params: { id: auditId, version: String(version) },
      locals: locals(admin)
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('generando');
    expect(body.data.version).toBe(version);
  });

  it('fila generando vieja se reporta y persiste como error (R14)', async () => {
    const { auditId, version, admin } = await seedGenerating(400_000); // > 300000 default

    const res = await statusGet({
      params: { id: auditId, version: String(version) },
      locals: locals(admin)
    } as never);

    const body = await res.json();
    expect(body.data.status).toBe('error');
    expect(body.data.error_message).toContain('timeout');

    const [row] = await sql<{ status: string; error_message: string }[]>`
      SELECT status, error_message FROM audit_report
      WHERE audit_id = ${auditId} AND version = ${version}
    `;
    expect(row.status).toBe('error');
    expect(row.error_message).not.toBe('');
  });

  it('fila generando reciente sigue generando', async () => {
    const { auditId, version, admin } = await seedGenerating(5_000);
    const res = await statusGet({
      params: { id: auditId, version: String(version) },
      locals: locals(admin)
    } as never);
    const body = await res.json();
    expect(body.data.status).toBe('generando');
  });

  it('401 sin sesión y 404 sin informe', async () => {
    const { auditId, version } = await seedGenerating(1000);
    const noSession = await statusGet({
      params: { id: auditId, version: String(version) },
      locals: locals(null)
    } as never);
    expect(noSession.status).toBe(401);

    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const notFound = await statusGet({
      params: { id: auditId, version: '99' },
      locals: locals(admin)
    } as never);
    expect(notFound.status).toBe(404);
  });
});
