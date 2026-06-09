import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('aws4fetch', () => {
  class MockAwsClient {
    async sign(url: string | URL, init?: { method?: string }): Promise<Request> {
      const u = new URL(url.toString());
      u.searchParams.set('X-Amz-Signature', 'mock-signature');
      return new Request(u.toString(), { method: init?.method ?? 'GET' });
    }
  }
  return { AwsClient: MockAwsClient };
});

import { setSqlForTests } from '../../src/lib/server/db/client';
import { POST as confirmPost } from '../../src/routes/api/audits/[auditId]/attachments/confirm/+server';
import { POST as presignPutPost } from '../../src/routes/api/audits/[auditId]/attachments/presign-put/+server';
import { GET as presignGetHandler } from '../../src/routes/api/attachments/[attachmentId]/presign-get/+server';
import type { AppUser } from '../../src/lib/server/auth/types';
import { applyTestR2Env } from '../fixtures/r2-mock';
import { findUserIdByEmail } from '../helpers/auth';
import { getFirstTemplateItemId, insertTestAuditRow } from '../helpers/backoffice';
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
  if (!row) {
    throw new Error('section not found');
  }
  return row.code;
}

function staffLocals(user: AppUser): App.Locals {
  return { user };
}

describe('attachments presign API', () => {
  let sql: postgres.Sql;
  let adminUser: AppUser;
  let auditId: string;
  let itemId: string;
  let sectionCode: string;

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
      active: true
    };

    const row = await insertTestAuditRow(sql, {
      razonSocial: 'Adjuntos Test SA',
      status: 'en_relevamiento'
    });
    auditId = row.auditId;
    itemId = await getFirstTemplateItemId(sql, 'it');
    sectionCode = await getSectionCodeForItem(sql, itemId);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('presign-put returns upload envelope for staff', async () => {
    const response = await presignPutPost({
      params: { auditId },
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          section_code: sectionCode,
          filename: 'foto.jpg',
          content_type: 'image/jpeg',
          size_bytes: 1024,
          kind: 'photo'
        })
      }),
      locals: staffLocals(adminUser)
    } as never);

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.upload_url).toContain('X-Amz-Signature');
    expect(body.data.r2_key).toContain(`audits/${auditId}/${sectionCode}/`);
  });

  it('confirm creates attachment and updates audit_response file_ref', async () => {
    const presignRes = await presignPutPost({
      params: { auditId },
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          section_code: sectionCode,
          filename: 'foto.jpg',
          content_type: 'image/jpeg',
          size_bytes: 2048,
          kind: 'photo'
        })
      }),
      locals: staffLocals(adminUser)
    } as never);
    const presignBody = await presignRes.json();
    const r2Key = presignBody.data.r2_key as string;

    const confirmRes = await confirmPost({
      params: { auditId },
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: itemId,
          r2_key: r2Key,
          filename: 'foto.jpg',
          content_type: 'image/jpeg',
          size_bytes: 2048,
          kind: 'photo'
        })
      }),
      locals: staffLocals(adminUser)
    } as never);

    const confirmBody = await confirmRes.json();
    expect(confirmRes.status).toBe(200);
    expect(confirmBody.data.attachment_id).toBeDefined();

    const [attachment] = await sql<{ r2_key: string }[]>`
      SELECT r2_key FROM attachment WHERE id = ${confirmBody.data.attachment_id}
    `;
    expect(attachment.r2_key).toBe(r2Key);

    const [responseRow] = await sql<{ value: { attachment_ids: string[] } }[]>`
      SELECT value FROM audit_response
      WHERE audit_id = ${auditId} AND item_id = ${itemId}
    `;
    expect(responseRow.value.attachment_ids).toContain(confirmBody.data.attachment_id);
  });

  it('rejects duplicate r2_key with 409', async () => {
    const r2Key = `audits/${auditId}/${sectionCode}/33333333-3333-3333-3333-333333333333`;

    const first = await confirmPost({
      params: { auditId },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          item_id: itemId,
          r2_key: r2Key,
          filename: 'a.jpg',
          content_type: 'image/jpeg',
          size_bytes: 100,
          kind: 'photo'
        })
      }),
      locals: staffLocals(adminUser)
    } as never);
    expect(first.status).toBe(200);

    const second = await confirmPost({
      params: { auditId },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          item_id: itemId,
          r2_key: r2Key,
          filename: 'b.jpg',
          content_type: 'image/jpeg',
          size_bytes: 100,
          kind: 'photo'
        })
      }),
      locals: staffLocals(adminUser)
    } as never);
    expect(second.status).toBe(409);
  });

  it('rejects invalid MIME and oversized payload', async () => {
    const badMime = await presignPutPost({
      params: { auditId },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          item_id: null,
          section_code: null,
          filename: 'evil.exe',
          content_type: 'application/x-executable',
          size_bytes: 100,
          kind: 'export'
        })
      }),
      locals: staffLocals(adminUser)
    } as never);
    expect(badMime.status).toBe(400);

    const tooBig = await presignPutPost({
      params: { auditId },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          item_id: null,
          section_code: null,
          filename: 'big.pdf',
          content_type: 'application/pdf',
          size_bytes: 30_000_000,
          kind: 'export'
        })
      }),
      locals: staffLocals(adminUser)
    } as never);
    expect(tooBig.status).toBe(400);
  });

  it('returns 401 without session and 403 for unauthorized role', async () => {
    const anon = await presignPutPost({
      params: { auditId },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          item_id: null,
          section_code: null,
          filename: 'f.pdf',
          content_type: 'application/pdf',
          size_bytes: 100,
          kind: 'export'
        })
      }),
      locals: { user: null }
    } as never);
    expect(anon.status).toBe(401);

    const forbidden = await presignPutPost({
      params: { auditId },
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          item_id: null,
          section_code: null,
          filename: 'f.pdf',
          content_type: 'application/pdf',
          size_bytes: 100,
          kind: 'export'
        })
      }),
      locals: {
        user: {
          id: '00000000-0000-0000-0000-000000000099',
          email: 'externo@test.com',
          name: 'Externo',
          role: 'guest',
          active: true
        } as unknown as AppUser
      }
    } as never);
    expect(forbidden.status).toBe(403);
  });

  it('presign-get returns download URL for existing attachment', async () => {
    const r2Key = `audits/${auditId}/_general/44444444-4444-4444-4444-444444444444`;
    const [att] = await sql<{ id: string }[]>`
      INSERT INTO attachment (
        audit_id, r2_key, filename, content_type, size_bytes, kind, uploaded_by
      )
      VALUES (
        ${auditId}, ${r2Key}, 'doc.pdf', 'application/pdf', 500, 'export', ${adminUser.id}
      )
      RETURNING id
    `;

    const res = await presignGetHandler({
      params: { attachmentId: att.id },
      locals: staffLocals(adminUser)
    } as never);

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.download_url).toContain(r2Key);
    expect(body.data.download_url).toContain('X-Amz-Signature');
  });
});
