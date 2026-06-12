import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { confirmUpload, requestPresignedUpload } from '../src/lib/server/storage';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserByEmail } from './helpers/auth';
import { seedAuditFormFixture, listTecnicoItemsByFieldType } from './fixtures/audit-form';
import { resetAwsClientForTests } from '../src/lib/server/storage/r2-client';
import { resetR2EnvForTests } from '../src/lib/server/storage/r2-config';
import type postgres from 'postgres';

describe('form photo upload', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
    process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? 'test-account';
    process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? 'test-secret';
    process.env.R2_BUCKET = process.env.R2_BUCKET ?? 'test-bucket';
    resetR2EnvForTests();
    resetAwsClientForTests();
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('presign → confirm updates file_ref attachment_ids', async () => {
    const { auditId } = await seedAuditFormFixture(sql, { status: 'en_relevamiento' });
    await sql`UPDATE audit SET status = 'en_relevamiento' WHERE id = ${auditId}`;

    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const [fileRefItem] = await sql<{ id: string }[]>`
      SELECT ti.id
      FROM template_item ti
      JOIN section s ON s.id = ti.section_id
      JOIN audit a ON s.template_id = ANY(a.template_ids)
      WHERE a.id = ${auditId} AND ti.field_type = 'file_ref'
      LIMIT 1
    `;
    expect(fileRefItem).toBeTruthy();

    const [section] = await sql<{ code: string }[]>`
      SELECT s.code FROM section s
      JOIN template_item ti ON ti.section_id = s.id
      WHERE ti.id = ${fileRefItem.id}
    `;

    vi.spyOn(await import('../src/lib/server/storage/presign'), 'presignPut').mockResolvedValue({
      uploadUrl: 'https://example.com/upload',
      r2Key: `audits/${auditId}/${section.code}/test.jpg`,
      expiresAt: new Date(Date.now() + 60000),
      headers: { 'Content-Type': 'image/jpeg' }
    });

    const presign = await requestPresignedUpload({
      auditId,
      itemId: fileRefItem.id,
      sectionCode: section.code,
      filename: 'test.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
      kind: 'photo',
      userId: tech!.id
    });

    const confirm = await confirmUpload({
      auditId,
      itemId: fileRefItem.id,
      r2Key: presign.r2Key,
      filename: 'test.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
      kind: 'photo',
      userId: tech!.id
    });

    expect(confirm.attachmentId).toBeTruthy();

    const [resp] = await sql<{ value: { attachment_ids: string[] } }[]>`
      SELECT value FROM audit_response
      WHERE audit_id = ${auditId} AND item_id = ${fileRefItem.id}
    `;
    expect(resp.value.attachment_ids).toContain(confirm.attachmentId);
  });

  it('confirm en ítem table no pisa filas existentes del inventario', async () => {
    const { auditId } = await seedAuditFormFixture(sql, { status: 'en_relevamiento' });
    await sql`UPDATE audit SET status = 'en_relevamiento' WHERE id = ${auditId}`;

    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const itemsByType = await listTecnicoItemsByFieldType(sql, auditId);
    const tableItemId = itemsByType.get('table');
    expect(tableItemId).toBeTruthy();

    const tableValue = {
      rows: [
        {
          row_id: 'row-keep',
          cells: { tipo: 'PC', marca: 'Dell' },
          attachment_ids: [] as string[]
        }
      ]
    };

    await sql`
      INSERT INTO audit_response (audit_id, item_id, value, source, updated_by)
      VALUES (
        ${auditId},
        ${tableItemId},
        ${sql.json(tableValue as never)},
        'tecnico',
        ${tech!.id}
      )
    `;

    const [section] = await sql<{ code: string }[]>`
      SELECT s.code FROM section s
      JOIN template_item ti ON ti.section_id = s.id
      WHERE ti.id = ${tableItemId}
    `;

    vi.spyOn(await import('../src/lib/server/storage/presign'), 'presignPut').mockResolvedValue({
      uploadUrl: 'https://example.com/upload',
      r2Key: `audits/${auditId}/${section.code}/equipo.jpg`,
      expiresAt: new Date(Date.now() + 60000),
      headers: { 'Content-Type': 'image/jpeg' }
    });

    const presign = await requestPresignedUpload({
      auditId,
      itemId: tableItemId,
      sectionCode: section.code,
      filename: 'equipo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 2048,
      kind: 'photo',
      userId: tech!.id
    });

    await confirmUpload({
      auditId,
      itemId: tableItemId,
      r2Key: presign.r2Key,
      filename: 'equipo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 2048,
      kind: 'photo',
      userId: tech!.id
    });

    const [resp] = await sql<{ value: { rows: typeof tableValue.rows } }[]>`
      SELECT value FROM audit_response
      WHERE audit_id = ${auditId} AND item_id = ${tableItemId}
    `;
    expect(resp.value.rows).toHaveLength(1);
    expect(resp.value.rows[0].cells).toEqual({ tipo: 'PC', marca: 'Dell' });
    expect(resp.value.rows[0].attachment_ids).toEqual([]);
  });
});
