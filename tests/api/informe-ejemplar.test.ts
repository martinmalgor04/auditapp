import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import {
  approveReport,
  getReportByAuditVersion,
  insertReport,
  saveDraftsAndFinish,
  updateReportStatus
} from '../../src/lib/server/db/informe-reports';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedCanonicalAuditFixture } from '../fixtures/canonical-audit';
import {
  buildValidClientDraft,
  buildValidInternalDraft,
  loadInformeCanonicalGolden
} from '../fixtures/informe-claude-mock';
import type { AppUser } from '../../src/lib/server/auth/types';
import { POST } from '../../src/routes/api/audits/[id]/report/[version]/ejemplar/+server';

function mockEvent(input: {
  auditId: string;
  version: number;
  user?: AppUser | null;
  body: { ejemplar: boolean };
}) {
  return {
    params: { id: input.auditId, version: String(input.version) },
    locals: { user: input.user ?? null },
    request: new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.body)
    })
  } as Parameters<typeof POST>[0];
}

describe('POST /api/audits/[id]/report/[version]/ejemplar (R10)', () => {
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

  async function seedApprovedReport() {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const row = await insertReport({
      auditId,
      canonicalJson: golden,
      schemaVersion: golden.schema_version,
      requestedBy: admin!.id
    });
    await updateReportStatus(row.id, 'pendiente', 'generando');
    await saveDraftsAndFinish({
      id: row.id,
      clientDraft: buildValidClientDraft(['A1']),
      internalDraft: buildValidInternalDraft(),
      promptVersion: '2.0',
      model: 'test'
    });
    await approveReport(row.id, admin!.id);
    return { auditId, version: row.version, admin: admin!, tech: tech! };
  }

  it('admin marca/desmarca aprobado → 200 y columna actualizada', async () => {
    const { auditId, version, admin } = await seedApprovedReport();

    const resOn = await POST(
      mockEvent({ auditId, version, user: admin, body: { ejemplar: true } })
    );
    expect(resOn.status).toBe(200);
    let report = await getReportByAuditVersion(auditId, version);
    expect(report!.ejemplar).toBe(true);

    const resOff = await POST(
      mockEvent({ auditId, version, user: admin, body: { ejemplar: false } })
    );
    expect(resOff.status).toBe(200);
    report = await getReportByAuditVersion(auditId, version);
    expect(report!.ejemplar).toBe(false);
  });

  it('borrador → 409', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const row = await insertReport({
      auditId,
      canonicalJson: golden,
      schemaVersion: golden.schema_version,
      requestedBy: admin!.id
    });
    await updateReportStatus(row.id, 'pendiente', 'generando');
    await saveDraftsAndFinish({
      id: row.id,
      clientDraft: buildValidClientDraft(['A1']),
      internalDraft: buildValidInternalDraft(),
      promptVersion: '2.0',
      model: 'test'
    });

    const res = await POST(
      mockEvent({ auditId, version: row.version, user: admin!, body: { ejemplar: true } })
    );
    expect(res.status).toBe(409);
  });

  it('técnico → 403', async () => {
    const { auditId, version, tech } = await seedApprovedReport();
    const res = await POST(
      mockEvent({ auditId, version, user: tech, body: { ejemplar: true } })
    );
    expect(res.status).toBe(403);
  });

  it('sin sesión → 401', async () => {
    const { auditId, version } = await seedApprovedReport();
    const res = await POST(
      mockEvent({ auditId, version, user: null, body: { ejemplar: true } })
    );
    expect(res.status).toBe(401);
  });
});
