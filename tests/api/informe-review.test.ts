import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedCanonicalAuditFixture } from '../fixtures/canonical-audit';
import {
  buildValidClientDraft,
  buildValidInternalDraft,
  loadInformeCanonicalGolden,
  mockAdapterValid
} from '../fixtures/informe-claude-mock';
import { insertReport } from '../../src/lib/server/db/informe-reports';
import {
  GET as detailGet,
  PATCH as detailPatch
} from '../../src/routes/api/audits/[id]/report/[version]/+server';
import { POST as retryPost } from '../../src/routes/api/audits/[id]/report/[version]/retry/+server';
import { POST as approvePost } from '../../src/routes/api/audits/[id]/report/[version]/approve/+server';
import { GET as editsGet } from '../../src/routes/api/audits/[id]/report/[version]/edits/+server';
import { setInformeAdapterForTests } from '../../src/lib/server/informe/claude';
import type { AppUser } from '../../src/lib/server/auth/types';

function locals(user: unknown) {
  return { user } as never;
}

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('informe review API', () => {
  let sql: postgres.Sql;
  let admin: AppUser;
  let tech: AppUser; // facu: técnico asignado por la fixture
  let otherTech: AppUser; // simon: no asignado
  const golden = loadInformeCanonicalGolden();
  const codes = ['A1', 'A2'];

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    process.env.ANTHROPIC_API_KEY = 'test-key';
    admin = (await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar'))!;
    tech = (await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar'))!;
    otherTech = (await findUserByEmail(sql, 'simon@serviciosysistemas.com.ar'))!;
  });

  afterEach(() => {
    setInformeAdapterForTests(undefined);
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function seedReportInStatus(status: 'borrador' | 'error' | 'aprobado') {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const row = await insertReport({
      auditId,
      canonicalJson: golden,
      schemaVersion: golden.schema_version,
      requestedBy: admin.id
    });
    if (status === 'borrador' || status === 'aprobado') {
      await sql`
        UPDATE audit_report
        SET status = 'borrador',
            client_draft = ${JSON.stringify(buildValidClientDraft(codes))}::jsonb,
            internal_draft = ${JSON.stringify(buildValidInternalDraft())}::jsonb
        WHERE id = ${row.id}
      `;
    }
    if (status === 'aprobado') {
      await sql`
        UPDATE audit_report
        SET status = 'aprobado', approved_by = ${admin.id}, approved_at = now()
        WHERE id = ${row.id}
      `;
    }
    if (status === 'error') {
      await sql`
        UPDATE audit_report
        SET status = 'error', error_message = 'falló la generación'
        WHERE id = ${row.id}
      `;
    }
    return { auditId, reportId: row.id, version: row.version };
  }

  it('GET detalle incluye internal_draft solo para admin (R17)', async () => {
    const { auditId, version } = await seedReportInStatus('aprobado');

    const adminRes = await detailGet({
      params: { id: auditId, version: String(version) },
      locals: locals(admin)
    } as never);
    expect(adminRes.status).toBe(200);
    const adminBody = await adminRes.json();
    expect(adminBody.data.internal_draft).toBeTruthy();

    const techRes = await detailGet({
      params: { id: auditId, version: String(version) },
      locals: locals(tech)
    } as never);
    expect(techRes.status).toBe(200);
    const techBody = await techRes.json();
    expect(techBody.data.internal_draft).toBeUndefined();
    expect(techBody.data.canonical_json).toBeUndefined();
    expect(techBody.data.client_draft).toBeTruthy();
  });

  it('técnico asignado: aprobado 200, borrador 403; no asignado 403 (R1)', async () => {
    const draft = await seedReportInStatus('borrador');
    const borradorRes = await detailGet({
      params: { id: draft.auditId, version: String(draft.version) },
      locals: locals(tech)
    } as never);
    expect(borradorRes.status).toBe(403);

    const aprobado = await seedReportInStatus('aprobado');
    const otherRes = await detailGet({
      params: { id: aprobado.auditId, version: String(aprobado.version) },
      locals: locals(otherTech)
    } as never);
    expect(otherRes.status).toBe(403);
  });

  it('PATCH válido persiste edición con edited_by/edited_at (R20)', async () => {
    const { auditId, version, reportId } = await seedReportInStatus('borrador');
    const edited = buildValidClientDraft(codes);
    edited.resumen.lead = 'Lead editado por el admin.';

    const res = await detailPatch({
      params: { id: auditId, version: String(version) },
      locals: locals(admin),
      request: jsonRequest({ client_draft: edited, origin: 'form' })
    } as never);

    expect(res.status).toBe(200);
    const [row] = await sql<
      { client_draft: { resumen: { lead: string } }; edited_by: string; edited_at: Date }[]
    >`SELECT client_draft, edited_by, edited_at FROM audit_report WHERE id = ${reportId}`;
    expect(row.client_draft.resumen.lead).toBe('Lead editado por el admin.');
    expect(row.edited_by).toBe(admin.id);
    expect(row.edited_at).toBeTruthy();
  });

  it('PATCH sobre aprobado 409, PATCH inválido 400 (R20)', async () => {
    const aprobado = await seedReportInStatus('aprobado');
    const res409 = await detailPatch({
      params: { id: aprobado.auditId, version: String(aprobado.version) },
      locals: locals(admin),
      request: jsonRequest({ client_draft: buildValidClientDraft(codes) })
    } as never);
    expect(res409.status).toBe(409);

    const borrador = await seedReportInStatus('borrador');
    const invalid = buildValidClientDraft(codes) as Record<string, unknown>;
    delete (invalid.resumen as Record<string, unknown>).diagnostico;
    const res400 = await detailPatch({
      params: { id: borrador.auditId, version: String(borrador.version) },
      locals: locals(admin),
      request: jsonRequest({ client_draft: invalid })
    } as never);
    expect(res400.status).toBe(400);
  });

  it('PATCH re-sobrescribe índices con el canónico (R12)', async () => {
    const { auditId, version, reportId } = await seedReportInStatus('borrador');
    const edited = buildValidClientDraft(codes);
    edited.indices = { erp: { valor: 1, semaforo: 'green' } };

    await detailPatch({
      params: { id: auditId, version: String(version) },
      locals: locals(admin),
      request: jsonRequest({ client_draft: edited })
    } as never);

    const [row] = await sql<{ client_draft: { indices: { erp: { valor: number } } } }[]>`
      SELECT client_draft FROM audit_report WHERE id = ${reportId}
    `;
    expect(row.client_draft.indices.erp.valor).toBe(golden.indices.erp);
  });

  it('PATCH loom_url válida y rechazo de URL no-Loom (R25)', async () => {
    const { auditId, version, reportId } = await seedReportInStatus('borrador');

    const ok = await detailPatch({
      params: { id: auditId, version: String(version) },
      locals: locals(admin),
      request: jsonRequest({ loom_url: 'https://www.loom.com/share/xyz' })
    } as never);
    expect(ok.status).toBe(200);
    const [row] = await sql<{ loom_url: string }[]>`
      SELECT loom_url FROM audit_report WHERE id = ${reportId}
    `;
    expect(row.loom_url).toBe('https://www.loom.com/share/xyz');

    const bad = await detailPatch({
      params: { id: auditId, version: String(version) },
      locals: locals(admin),
      request: jsonRequest({ loom_url: 'https://youtube.com/x' })
    } as never);
    expect(bad.status).toBe(400);
  });

  it('retry sobre error reejecuta y termina borrador con la misma versión; sobre borrador 409 (R22)', async () => {
    setInformeAdapterForTests(mockAdapterValid());
    const { auditId, version, reportId } = await seedReportInStatus('error');

    const res = await retryPost({
      params: { id: auditId, version: String(version) },
      locals: locals(admin)
    } as never);
    expect(res.status).toBe(202);

    await vi.waitFor(async () => {
      const [row] = await sql<{ status: string; version: number }[]>`
        SELECT status, version FROM audit_report WHERE id = ${reportId}
      `;
      expect(row.status).toBe('borrador');
      expect(row.version).toBe(version);
    });

    const res409 = await retryPost({
      params: { id: auditId, version: String(version) },
      locals: locals(admin)
    } as never);
    expect(res409.status).toBe(409);
  });

  it('approve persiste quién/cuándo; segundo approve y PATCH posterior 409 (R23)', async () => {
    const { auditId, version, reportId } = await seedReportInStatus('borrador');

    const res = await approvePost({
      params: { id: auditId, version: String(version) },
      locals: locals(admin)
    } as never);
    expect(res.status).toBe(200);

    const [row] = await sql<{ status: string; approved_by: string; approved_at: Date }[]>`
      SELECT status, approved_by, approved_at FROM audit_report WHERE id = ${reportId}
    `;
    expect(row.status).toBe('aprobado');
    expect(row.approved_by).toBe(admin.id);
    expect(row.approved_at).toBeTruthy();

    const again = await approvePost({
      params: { id: auditId, version: String(version) },
      locals: locals(admin)
    } as never);
    expect(again.status).toBe(409);

    const patchAfter = await detailPatch({
      params: { id: auditId, version: String(version) },
      locals: locals(admin),
      request: jsonRequest({ client_draft: buildValidClientDraft(codes) })
    } as never);
    expect(patchAfter.status).toBe(409);
  });

  it('dos PATCH inline crean historial seq 1 y 2; HTML embebido persiste texto plano (R30, R31)', async () => {
    const { auditId, version, reportId } = await seedReportInStatus('borrador');

    const first = buildValidClientDraft(codes);
    first.resumen.lead = 'Primera edición inline.';
    const res1 = await detailPatch({
      params: { id: auditId, version: String(version) },
      locals: locals(admin),
      request: jsonRequest({ client_draft: first, origin: 'inline' })
    } as never);
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.data.seq).toBe(1);

    const second = buildValidClientDraft(codes);
    second.resumen.lead = 'Texto <strong>con</strong> <em>HTML</em> pegado.';
    const res2 = await detailPatch({
      params: { id: auditId, version: String(version) },
      locals: locals(admin),
      request: jsonRequest({ client_draft: second, origin: 'inline' })
    } as never);
    const body2 = await res2.json();
    expect(body2.data.seq).toBe(2);

    // HTML descartado: solo texto plano (R30)
    const [row] = await sql<{ client_draft: { resumen: { lead: string } } }[]>`
      SELECT client_draft FROM audit_report WHERE id = ${reportId}
    `;
    expect(row.client_draft.resumen.lead).toBe('Texto con HTML pegado.');

    // Historial append-only consultable (R31)
    const editsRes = await editsGet({
      params: { id: auditId, version: String(version) },
      locals: locals(admin)
    } as never);
    expect(editsRes.status).toBe(200);
    const editsBody = await editsRes.json();
    expect(editsBody.data.map((e: { seq: number }) => e.seq)).toEqual([1, 2]);
    expect(editsBody.data[0].change_summary).toBe('Edición inline');
    expect(editsBody.data[0].client_draft.resumen.lead).toBe('Primera edición inline.');
    expect(editsBody.data[0].edited_by).toBe(admin.id);

    // PATCH origin form no agrega historial
    const res3 = await detailPatch({
      params: { id: auditId, version: String(version) },
      locals: locals(admin),
      request: jsonRequest({ client_draft: first, origin: 'form' })
    } as never);
    expect(res3.status).toBe(200);
    const [count] = await sql<{ count: string }[]>`
      SELECT count(*) FROM audit_report_edit WHERE report_id = ${reportId}
    `;
    expect(Number(count.count)).toBe(2);
  });
});
