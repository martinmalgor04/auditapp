import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { buildAuditBundle } from '../src/lib/server/bundle/build';
import { importAuditBundle } from '../src/lib/server/bundle/import';
import type { AuditBundle } from '../src/lib/server/bundle/schema';
import { itemKeyString } from '../src/lib/server/bundle/item-key';
import { seedBundleAuditFixture } from './fixtures/audit-bundle';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserByEmail } from './helpers/auth';

/**
 * Compara dos bundles ignorando UUID de instancia, instantes de export y
 * el remapeo de attachment_ids embebidos (que cambian entre instancias por diseño).
 */
function bundlesEquivalent(a: AuditBundle, b: AuditBundle): boolean {
  // Cabecera por clave natural (sin public_token, sin scheduled instant exacto irrelevante).
  if (a.header.name !== b.header.name) return false;
  if (a.header.status !== b.header.status) return false;
  if (a.header.segment !== b.header.segment) return false;
  if (JSON.stringify(a.header.types) !== JSON.stringify(b.header.types)) return false;
  if (a.header.client.cuit !== b.header.client.cuit) return false;
  if (a.header.client.razon_social !== b.header.client.razon_social) return false;
  if (a.header.assigned_tech?.email !== b.header.assigned_tech?.email) return false;
  if (JSON.stringify(a.header.templates) !== JSON.stringify(b.header.templates)) return false;

  // Respuestas por item_key (ignorando attachment_ids embebidos).
  const normResponses = (bundle: AuditBundle) =>
    bundle.responses
      .map((r) => ({
        key: itemKeyString(r.item_key),
        na: r.na,
        observations: r.observations,
        source: r.source,
        // value sin attachment_ids (remapeados) ni rows.attachment_ids
        value: stripAttachmentIds(r.value)
      }))
      .sort((x, y) => x.key.localeCompare(y.key));
  if (JSON.stringify(normResponses(a)) !== JSON.stringify(normResponses(b))) return false;

  // Scores por section_code.
  const normScores = (bundle: AuditBundle) =>
    bundle.section_scores
      .map((s) => ({ code: s.section_code, score: s.score, observations: s.observations }))
      .sort((x, y) => x.code.localeCompare(y.code));
  if (JSON.stringify(normScores(a)) !== JSON.stringify(normScores(b))) return false;

  // Cierre.
  if (JSON.stringify(stripUserAndTime(a.closure)) !== JSON.stringify(stripUserAndTime(b.closure)))
    return false;

  // Adjuntos por r2_key.
  const normAtts = (bundle: AuditBundle) =>
    bundle.attachments
      .map((at) => ({
        r2_key: at.r2_key,
        filename: at.filename,
        kind: at.kind,
        size_bytes: at.size_bytes,
        item_key: at.item_key ? itemKeyString(at.item_key) : null
      }))
      .sort((x, y) => x.r2_key.localeCompare(y.r2_key));
  if (JSON.stringify(normAtts(a)) !== JSON.stringify(normAtts(b))) return false;

  return true;
}

function stripAttachmentIds(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  if (Array.isArray(obj.attachment_ids)) {
    return { ...obj, attachment_ids: '<remapped>' };
  }
  if (Array.isArray(obj.rows)) {
    return {
      ...obj,
      rows: (obj.rows as Array<Record<string, unknown>>).map((row) =>
        Array.isArray(row.attachment_ids) ? { ...row, attachment_ids: '<remapped>' } : row
      )
    };
  }
  return value;
}

function stripUserAndTime(closure: AuditBundle['closure']) {
  if (!closure) return null;
  return {
    indice_it: closure.indice_it,
    indice_erp: closure.indice_erp,
    top_risks: closure.top_risks,
    quick_wins: closure.quick_wins,
    upsell_findings: closure.upsell_findings,
    next_step: closure.next_step
  };
}

describe('bundle round-trip (R16)', () => {
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

  it('export → import → export produce bundles equivalentes', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'cerrada' });
    const first = await buildAuditBundle(fx.auditId);

    // Borramos la auditoría de origen para forzar recreación íntegra al importar.
    await sql`DELETE FROM audit WHERE id = ${fx.auditId}`;
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');

    const result = await importAuditBundle(first, admin!, 'permissive');
    if (result.mode === 'dry-run') throw new Error('unexpected');

    const second = await buildAuditBundle(result.auditId);

    expect(bundlesEquivalent(first, second)).toBe(true);
    // Sanity: los UUID de instancia difieren (no es el mismo audit_id).
    expect(second.dedupe_key.origin_audit_id).not.toBe(first.dedupe_key.origin_audit_id);
  });
});
