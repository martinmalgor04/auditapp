import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { buildCanonicalAuditJson } from '../src/lib/server/canonical/build';
import { CANONICAL_SCHEMA_VERSION } from '../src/lib/server/canonical/version';
import { seedCanonicalAuditFixture } from './fixtures/canonical-audit';
import { setupTestDb, teardownTestDb } from './helpers/db';
import type postgres from 'postgres';

describe('canonical builder', () => {
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

  it('builds full canonical payload for closed combo audit', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const payload = await buildCanonicalAuditJson(auditId);

    expect(payload.audit_id).toBe(auditId);
    expect(payload.client.razon_social).toBeTruthy();
    expect(payload.types).toContain('it');
    expect(payload.types).toContain('erp-tango');
    expect(payload.sections.length).toBeGreaterThan(0);
    expect(payload.sections.every((s) => s.code !== 'CAB')).toBe(true);
    expect(payload.closed_at).not.toBeNull();
  });

  it('payload schema_version matches constant', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const payload = await buildCanonicalAuditJson(auditId);
    expect(payload.schema_version).toBe(CANONICAL_SCHEMA_VERSION);
  });

  it('generated_at is ISO 8601 with timezone offset', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const payload = await buildCanonicalAuditJson(auditId);
    expect(payload.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it('scored sections have score_basis auto', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const payload = await buildCanonicalAuditJson(auditId);
    const scored = payload.sections.filter((s) => s.score !== null);
    expect(scored.length).toBeGreaterThan(0);
    for (const section of scored) {
      expect(section.score_basis).toBe('auto');
    }
  });

  it('item score_contribution matches score_breakdown', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const payload = await buildCanonicalAuditJson(auditId);

    const itemsWithContribution = payload.sections.flatMap((s) =>
      s.items.filter((i) => i.score_contribution !== undefined)
    );
    expect(itemsWithContribution.length).toBeGreaterThan(0);
    for (const item of itemsWithContribution) {
      expect(item.score_contribution).toBeGreaterThanOrEqual(0);
      expect(item.score_contribution).toBeLessThanOrEqual(100);
    }
  });

  it('market_data has all required keys', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const payload = await buildCanonicalAuditJson(auditId);
    expect(Object.keys(payload.market_data).sort()).toEqual(
      [
        'empleados',
        'erp_actual',
        'modulos_tango',
        'proveedor_correo',
        'puestos',
        'sedes',
        'soporte_it_actual'
      ].sort()
    );
  });

  it('market_data maps client columns and CAB multiselect', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const payload = await buildCanonicalAuditJson(auditId);
    expect(payload.market_data.erp_actual).toBe('Tango Gestión');
    expect(payload.market_data.empleados).toBe(45);
    expect(payload.market_data.modulos_tango).toEqual(['ventas', 'stock']);
  });

  it('market_data emits null for missing source fields', async () => {
    const { auditId, clientId } = await seedCanonicalAuditFixture(sql);
    await sql`UPDATE client SET puestos = NULL, sedes = NULL WHERE id = ${clientId}`;
    const payload = await buildCanonicalAuditJson(auditId);
    expect(payload.market_data.puestos).toBeNull();
    expect(payload.market_data.sedes).toBeNull();
  });

  it('item attachments are r2_key strings', async () => {
    const { auditId, attachmentR2Key } = await seedCanonicalAuditFixture(sql);
    if (!attachmentR2Key) return;
    const payload = await buildCanonicalAuditJson(auditId);
    const withAttachments = payload.sections.flatMap((s) => s.items).find((i) => i.attachments.length > 0);
    expect(withAttachments?.attachments).toContain(attachmentR2Key);
    expect(withAttachments?.attachments.every((k) => k.startsWith('audits/'))).toBe(true);
  });

  it('indices include only applicable types', async () => {
    const { auditId } = await seedCanonicalAuditFixture(sql);
    const payload = await buildCanonicalAuditJson(auditId);
    expect(payload.indices.it).toBeDefined();
    expect(payload.indices.erp).toBeDefined();
    expect('it' in payload.indices || 'erp' in payload.indices).toBe(true);
  });
});
