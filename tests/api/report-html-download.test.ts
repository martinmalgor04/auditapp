import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import type { CanonicalAudit } from '../../src/lib/server/canonical/schema';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedCanonicalAuditFixture } from '../fixtures/canonical-audit';
import { buildValidClientDraft } from '../fixtures/informe-claude-mock';
import {
  loadInformeCanonicalIt,
  loadInformeCanonicalMixta
} from '../fixtures/informe-canonical-variants';
import { indexToSemaphore } from '../../src/lib/server/scoring/semaphore';
import { getReportByAuditVersion, insertReport } from '../../src/lib/server/db/informe-reports';
import { getAuditForReport } from '../../src/lib/server/informe/access';
import { buildInformeRenderModel } from '../../src/lib/server/informe/model';
import { renderInformeHtml } from '../../src/lib/informe/render';
import { GET as htmlGet } from '../../src/routes/api/audits/[id]/report/[version]/html/+server';
import type { AppUser } from '../../src/lib/server/auth/types';

function locals(user: unknown) {
  return { user } as never;
}

/** Construye un client_draft válido con los índices que el render espera del canónico. */
function draftWithIndices(canonical: CanonicalAudit, codes: string[]) {
  const draft = buildValidClientDraft(codes);
  const indices: Record<string, { valor: number; semaforo: ReturnType<typeof indexToSemaphore> }> =
    {};
  if (canonical.indices.it != null) {
    indices.it = { valor: canonical.indices.it, semaforo: indexToSemaphore(canonical.indices.it) };
  }
  if (canonical.indices.erp != null) {
    indices.erp = {
      valor: canonical.indices.erp,
      semaforo: indexToSemaphore(canonical.indices.erp)
    };
  }
  draft.indices = indices as never;
  return draft;
}

describe('descarga HTML del informe (#31)', () => {
  let sql: postgres.Sql;
  let admin: AppUser;
  let tech: AppUser; // facu: técnico asignado por la fixture
  let otherTech: AppUser; // simon: no asignado

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    admin = (await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar'))!;
    tech = (await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar'))!;
    otherTech = (await findUserByEmail(sql, 'simon@serviciosysistemas.com.ar'))!;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  /**
   * Seedea audit + report renderizable.
   * - `canonical` controla el tipo de informe (it / mixta) → ruta de render.
   * - `withVisit` setea started_at/finished_at de la auditoría (bloque de visita).
   * - `withDraft:false` deja el informe sin client_draft (caso 409).
   */
  async function seedReport(opts: {
    canonical?: CanonicalAudit;
    status?: 'borrador' | 'aprobado';
    withVisit?: boolean;
    withDraft?: boolean;
  }) {
    const {
      canonical = loadInformeCanonicalIt(),
      status = 'borrador',
      withVisit = false,
      withDraft = true
    } = opts;
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const row = await insertReport({
      auditId,
      canonicalJson: canonical,
      schemaVersion: canonical.schema_version,
      requestedBy: admin.id
    });
    // `audit_report_approved_coherence` exige approved_by/approved_at junto con
    // status='aprobado': se setean en el mismo UPDATE.
    const approvedBy = status === 'aprobado' ? admin.id : null;
    if (withDraft) {
      // El render necesita los índices del canónico en el draft; el pipeline real
      // los sobrescribe (overwriteIndicesFromCanonical). Acá lo replicamos.
      const clientDraft = draftWithIndices(canonical, ['A1', 'A2']);
      await sql`
        UPDATE audit_report
        SET status = ${status},
            client_draft = ${sql.json(clientDraft as never)},
            approved_by = ${approvedBy},
            approved_at = ${status === 'aprobado' ? sql`now()` : null}
        WHERE id = ${row.id}
      `;
    } else {
      // Sin client_draft: estado renderizable pero buildInformeRenderModel lanza.
      await sql`
        UPDATE audit_report
        SET status = ${status},
            approved_by = ${approvedBy},
            approved_at = ${status === 'aprobado' ? sql`now()` : null}
        WHERE id = ${row.id}
      `;
    }
    if (withVisit) {
      await sql`
        UPDATE audit
        SET started_at = '2026-06-08T09:00:00-03:00', finished_at = '2026-06-08T11:30:00-03:00'
        WHERE id = ${auditId}
      `;
    } else {
      await sql`UPDATE audit SET started_at = '2026-06-08T09:00:00-03:00', finished_at = NULL WHERE id = ${auditId}`;
    }
    return { auditId, reportId: row.id, version: row.version };
  }

  // ── R5, R6, R8, R2, R3, R4, R18 ─────────────────────────────────────────────
  it('200 con headers de descarga, cuerpo idéntico al panel y visita presente', async () => {
    const { auditId, version } = await seedReport({ withVisit: true });

    const res = await htmlGet({
      params: { id: auditId, version: String(version) },
      locals: locals(admin)
    } as never);

    // R8 / R5 / R6
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    const dispo = res.headers.get('Content-Disposition');
    expect(dispo?.startsWith('attachment; filename=')).toBe(true);

    const body = await res.text();

    // R2, R3: byte a byte === al modelo del panel (con timestamps de visita).
    const audit = (await getAuditForReport(auditId))!;
    const report = (await getReportByAuditVersion(auditId, version))!;
    const expected = renderInformeHtml(
      buildInformeRenderModel(report, {
        startedAt: audit.startedAt,
        finishedAt: audit.finishedAt
      })
    );
    expect(body).toBe(expected);

    // R4: logos por CDN R2, sin base64.
    expect(body).toContain('r2.dev/LOGOS/');
    expect(body).not.toContain('data:image');

    // R18: bloque de visita presente (informe `it` → render-it emite class="visita").
    expect(body).toContain('class="visita"');

    // R7: filename con la convención del repo, tipo `it`.
    expect(dispo).toMatch(/filename="\d{4}-\d{2}-\d{2}_informe_[a-z0-9-]+_it_v\d+\.html"/);
  });

  // ── R7: token de tipo `mixta` en el filename ────────────────────────────────
  it('informe mixto → filename con token _mixta_ (R7)', async () => {
    const { auditId, version } = await seedReport({ canonical: loadInformeCanonicalMixta() });
    const res = await htmlGet({
      params: { id: auditId, version: String(version) },
      locals: locals(admin)
    } as never);
    expect(res.status).toBe(200);
    const dispo = res.headers.get('Content-Disposition');
    expect(dispo).toMatch(/filename="\d{4}-\d{2}-\d{2}_informe_[a-z0-9-]+_mixta_v\d+\.html"/);
  });

  // ── R20: visita ausente cuando no hay finished_at ───────────────────────────
  it('sin finished_at NO incluye el bloque de visita y coincide con el panel', async () => {
    const { auditId, version } = await seedReport({ withVisit: false });

    const res = await htmlGet({
      params: { id: auditId, version: String(version) },
      locals: locals(admin)
    } as never);
    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).not.toContain('class="visita"');

    const audit = (await getAuditForReport(auditId))!;
    const report = (await getReportByAuditVersion(auditId, version))!;
    const expected = renderInformeHtml(
      buildInformeRenderModel(report, {
        startedAt: audit.startedAt,
        finishedAt: audit.finishedAt
      })
    );
    expect(body).toBe(expected);
  });

  // ── R9: sin sesión → 401, sin cuerpo del informe ────────────────────────────
  it('sin sesión → 401 sin cuerpo del informe (R9)', async () => {
    const { auditId, version } = await seedReport({});
    const res = await htmlGet({
      params: { id: auditId, version: String(version) },
      locals: locals(undefined)
    } as never);
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).not.toContain('class="visita"');
    expect(body).not.toContain('informe-a4');
  });

  // ── R10: técnico no asignado / informe no aprobado → 403 ─────────────────────
  it('técnico no asignado → 403 (R10)', async () => {
    const { auditId, version } = await seedReport({ status: 'aprobado' });
    const res = await htmlGet({
      params: { id: auditId, version: String(version) },
      locals: locals(otherTech)
    } as never);
    expect(res.status).toBe(403);
  });

  it('técnico asignado sobre informe no aprobado → 403 (R10)', async () => {
    const { auditId, version } = await seedReport({ status: 'borrador' });
    const res = await htmlGet({
      params: { id: auditId, version: String(version) },
      locals: locals(tech)
    } as never);
    expect(res.status).toBe(403);
  });

  it('técnico asignado sobre informe aprobado → 200 (R10)', async () => {
    const { auditId, version } = await seedReport({ status: 'aprobado' });
    const res = await htmlGet({
      params: { id: auditId, version: String(version) },
      locals: locals(tech)
    } as never);
    expect(res.status).toBe(200);
  });

  // ── R12, R13: 404 ───────────────────────────────────────────────────────────
  it('auditoría inexistente → 404 envelope (R12)', async () => {
    const res = await htmlGet({
      params: { id: '00000000-0000-0000-0000-000000000000', version: '1' },
      locals: locals(admin)
    } as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('versión inválida → 404 (R13)', async () => {
    const { auditId } = await seedReport({});
    const res = await htmlGet({
      params: { id: auditId, version: '0' },
      locals: locals(admin)
    } as never);
    expect(res.status).toBe(404);
  });

  it('versión inexistente → 404 (R13)', async () => {
    const { auditId } = await seedReport({});
    const res = await htmlGet({
      params: { id: auditId, version: '99' },
      locals: locals(admin)
    } as never);
    expect(res.status).toBe(404);
  });

  // ── R14: informe sin client_draft → 409 controlado, sin stack ───────────────
  it('informe sin client_draft → 409 envelope sin cuerpo parcial (R14)', async () => {
    const { auditId, version } = await seedReport({ withDraft: false });
    const res = await htmlGet({
      params: { id: auditId, version: String(version) },
      locals: locals(admin)
    } as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(JSON.stringify(body)).not.toContain('at '); // sin stack trace
  });
});
