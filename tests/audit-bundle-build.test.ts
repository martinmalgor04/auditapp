import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { auditBundleSchema } from '../src/lib/server/bundle/schema';
import { buildAuditBundle } from '../src/lib/server/bundle/build';
import { CANONICAL_SCHEMA_VERSION } from '../src/lib/server/canonical/version';
import { seedBundleAuditFixture } from './fixtures/audit-bundle';
import { setupTestDb, teardownTestDb } from './helpers/db';

describe('buildAuditBundle (export)', () => {
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

  it('produce un bundle que valida contra auditBundleSchema', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const bundle = await buildAuditBundle(fx.auditId);
    expect(() => auditBundleSchema.parse(bundle)).not.toThrow();
    expect(bundle.bundle_schema_version).not.toBe(CANONICAL_SCHEMA_VERSION);
  });

  it('no contiene UUID de origen en campos de referencia', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const bundle = await buildAuditBundle(fx.auditId);
    const serialized = JSON.stringify({
      header: bundle.header,
      responses: bundle.responses,
      section_scores: bundle.section_scores,
      closure: bundle.closure
    });
    // client.id, item ids, section ids, user ids no aparecen en refs.
    expect(serialized).not.toContain(fx.clientId);
    expect(serialized).not.toContain(fx.fileRefItemId);
    // El cliente viaja por clave natural.
    expect(bundle.header.client.cuit).toBe('30-99887766-5');
    expect(bundle.header.client.razon_social).toBe('Bundle Fixture SA');
    expect(bundle.header.assigned_tech?.email).toBe('facu@serviciosysistemas.com.ar');
    expect(bundle.header.templates).toContainEqual({ code: 'it', version: expect.any(String) });
  });

  it('preserva el status original (borrador, en_relevamiento, cerrada)', async () => {
    // CUITs distintos: client.cuit es UNIQUE parcial desde migración 013.
    const borrador = await seedBundleAuditFixture(sql, {
      status: 'borrador',
      cuit: '30-99887766-1'
    });
    const rel = await seedBundleAuditFixture(sql, {
      status: 'en_relevamiento',
      cuit: '30-99887766-2'
    });
    const cerrada = await seedBundleAuditFixture(sql, {
      status: 'cerrada',
      cuit: '30-99887766-3'
    });

    expect((await buildAuditBundle(borrador.auditId)).header.status).toBe('borrador');
    expect((await buildAuditBundle(rel.auditId)).header.status).toBe('en_relevamiento');
    const cerradaBundle = await buildAuditBundle(cerrada.auditId);
    expect(cerradaBundle.header.status).toBe('cerrada');
    expect(cerradaBundle.closure).not.toBeNull();
  });

  it('incluye adjuntos como refs r2_key sin binario; item_key null sin ítem', async () => {
    const fx = await seedBundleAuditFixture(sql, { status: 'en_relevamiento' });
    const bundle = await buildAuditBundle(fx.auditId);

    const fileRefAtt = bundle.attachments.find((a) => a.r2_key.endsWith('fileref.jpg'));
    expect(fileRefAtt).toBeDefined();
    expect(fileRefAtt?.item_key).not.toBeNull();
    expect(fileRefAtt).not.toHaveProperty('content');
    expect(fileRefAtt).not.toHaveProperty('base64');
    expect(fileRefAtt?.size_bytes).toBe(2048);

    const unlinked = bundle.attachments.find((a) => a.r2_key.endsWith('export.csv'));
    expect(unlinked?.item_key).toBeNull();
  });

  it('lanza AuditNotFoundError si la auditoría no existe', async () => {
    await expect(
      buildAuditBundle('00000000-0000-0000-0000-000000000000')
    ).rejects.toThrow();
  });
});
