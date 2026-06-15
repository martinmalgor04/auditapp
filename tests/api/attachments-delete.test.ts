import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('aws4fetch', () => {
  class MockAwsClient {
    async sign(
      url: string | URL,
      init?: { method?: string; aws?: { expires?: number; signQuery?: boolean } }
    ): Promise<Request> {
      const u = new URL(url.toString());
      u.searchParams.set('X-Amz-Signature', 'mock-signature');
      if (init?.aws?.expires) {
        u.searchParams.set('X-Amz-Expires', String(init.aws.expires));
      }
      return new Request(u.toString(), { method: init?.method ?? 'GET' });
    }

    async fetch(url: string | URL, init?: { method?: string }): Promise<Response> {
      if (init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 200 });
    }
  }
  return { AwsClient: MockAwsClient };
});

import { setSqlForTests } from '../../src/lib/server/db/client';
import { DELETE as deleteAttachmentHandler } from '../../src/routes/api/audits/[auditId]/attachments/[attachmentId]/+server';
import type { AppUser } from '../../src/lib/server/auth/types';
import { applyTestR2Env } from '../fixtures/r2-mock';
import { findUserIdByEmail } from '../helpers/auth';
import { getFileRefTemplateItemId, insertTestAuditRow } from '../helpers/backoffice';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import type postgres from 'postgres';

async function getSectionCodeForItem(sql: postgres.Sql, itemId: string): Promise<string> {
  const [row] = await sql<{ code: string }[]>`
    SELECT s.code
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE ti.id = ${itemId}
    LIMIT 1
  `;
  if (!row) throw new Error('section not found');
  return row.code;
}

async function getTableTemplateItemId(sql: postgres.Sql, templateCode = 'it'): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    SELECT ti.id
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    JOIN template t ON t.id = s.template_id
    WHERE ti.field_type = 'table'
      AND t.code = ${templateCode}
    LIMIT 1
  `;
  if (!row) throw new Error('table item not found');
  return row.id;
}

function staffLocals(user: AppUser): App.Locals {
  return { user };
}

describe('attachments delete API', () => {
  let sql: postgres.Sql;
  let adminUser: AppUser;
  let auditId: string;
  let fileRefItemId: string;
  let tableItemId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
    applyTestR2Env();
  });

  beforeEach(async () => {
    applyTestR2Env();
    const adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    adminUser = {
      id: adminId,
      email: 'admin@serviciosysistemas.com.ar',
      name: 'Admin',
      role: 'admin',
      active: true,
      auditTypes: null
    };

    const row = await insertTestAuditRow(sql, {
      razonSocial: 'Delete Adjuntos SA',
      status: 'en_relevamiento'
    });
    auditId = row.auditId;
    fileRefItemId = await getFileRefTemplateItemId(sql, 'it');
    tableItemId = await getTableTemplateItemId(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function insertTestAttachment(input: {
    itemId: string;
    r2Suffix: string;
  }): Promise<string> {
    const sectionCode = await getSectionCodeForItem(sql, input.itemId);
    const r2Key = `audits/${auditId}/${sectionCode}/${input.r2Suffix}`;
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO attachment (
        audit_id, item_id, r2_key, filename, content_type, size_bytes, kind, uploaded_by
      )
      VALUES (
        ${auditId},
        ${input.itemId},
        ${r2Key},
        'foto.jpg',
        'image/jpeg',
        1024,
        'photo',
        ${adminUser.id}
      )
      RETURNING id
    `;
    return row.id;
  }

  it('borra foto de file_ref y limpia audit_response', async () => {
    const attachmentId = await insertTestAttachment({
      itemId: fileRefItemId,
      r2Suffix: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    });

    await sql`
      INSERT INTO audit_response (audit_id, item_id, value, source, updated_by)
      VALUES (
        ${auditId},
        ${fileRefItemId},
        ${sql.json({ attachment_ids: [attachmentId] })},
        'tecnico',
        ${adminUser.id}
      )
    `;

    const del = await deleteAttachmentHandler({
      params: { auditId, attachmentId },
      request: new Request('http://localhost', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: fileRefItemId })
      }),
      locals: staffLocals(adminUser)
    } as never);
    expect(del.status).toBe(200);

    const [responseRow] = await sql<{ value: { attachment_ids: string[] } }[]>`
      SELECT value FROM audit_response
      WHERE audit_id = ${auditId} AND item_id = ${fileRefItemId}
    `;
    expect(responseRow.value.attachment_ids).toEqual([]);

    const [attachment] = await sql<{ id: string }[]>`
      SELECT id FROM attachment WHERE id = ${attachmentId}
    `;
    expect(attachment).toBeUndefined();
  });

  it('borra foto de una fila de tabla', async () => {
    const rowId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const attachmentId = await insertTestAttachment({
      itemId: tableItemId,
      r2Suffix: 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    });

    await sql`
      INSERT INTO audit_response (audit_id, item_id, value, source)
      VALUES (
        ${auditId},
        ${tableItemId},
        ${sql.json({
          rows: [{ row_id: rowId, cells: { tipo: 'PC' }, attachment_ids: [attachmentId] }]
        })},
        'tecnico'
      )
      ON CONFLICT (audit_id, item_id) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = now()
    `;

    const del = await deleteAttachmentHandler({
      params: { auditId, attachmentId },
      request: new Request('http://localhost', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: tableItemId, row_id: rowId })
      }),
      locals: staffLocals(adminUser)
    } as never);
    expect(del.status).toBe(200);

    const [responseRow] = await sql<{ value: { rows: Array<{ attachment_ids: string[] }> } }[]>`
      SELECT value FROM audit_response
      WHERE audit_id = ${auditId} AND item_id = ${tableItemId}
    `;
    expect(responseRow.value.rows[0].attachment_ids).toEqual([]);
  });

  it('rechaza borrar sin row_id en campo tabla', async () => {
    const attachmentId = await insertTestAttachment({
      itemId: tableItemId,
      r2Suffix: 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    });

    const del = await deleteAttachmentHandler({
      params: { auditId, attachmentId },
      request: new Request('http://localhost', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: tableItemId })
      }),
      locals: staffLocals(adminUser)
    } as never);
    expect(del.status).toBe(400);
  });
});
