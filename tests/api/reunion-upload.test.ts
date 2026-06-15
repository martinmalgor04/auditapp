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

vi.mock('../../src/lib/server/reunion/pipeline/worker', () => ({
  enqueueReunionProcessing: vi.fn().mockResolvedValue(undefined)
}));

import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { insertTestAuditRow } from '../helpers/backoffice';
import { applyTestR2Env } from '../fixtures/r2-mock';
import { POST as presignPut } from '../../src/routes/api/audits/[auditId]/reunion/sessions/[sessionId]/presign-put/+server';
import { POST as confirmUpload } from '../../src/routes/api/audits/[auditId]/reunion/sessions/[sessionId]/confirm/+server';
import { POST as createSession } from '../../src/routes/api/audits/[auditId]/reunion/sessions/+server';
import type { AppUser } from '../../src/lib/server/auth/types';
import type postgres from 'postgres';

function makeLocals(user: AppUser): App.Locals {
  return { user };
}

describe('reunion upload API', () => {
  let sql: postgres.Sql;
  let adminUser: AppUser;
  let auditId: string;
  let sessionId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
    applyTestR2Env();
  });

  beforeEach(async () => {
    applyTestR2Env();
    adminUser = (await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar'))!;

    const row = await insertTestAuditRow(sql, {
      razonSocial: 'Upload Test SA',
      status: 'en_relevamiento'
    });
    auditId = row.auditId;

    // Crear sesión con consentimiento
    const sessionRes = await createSession({
      params: { auditId },
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_type: 'visita',
          consent_recorded_at: new Date().toISOString()
        })
      }),
      locals: makeLocals(adminUser)
    } as never);
    const sessionBody = await sessionRes.json();
    sessionId = sessionBody.data.session_id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('presign con session_id inexistente → 404', async () => {
    const fakeSessionId = crypto.randomUUID();
    const res = await presignPut({
      params: { auditId, sessionId: fakeSessionId },
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'audio.webm',
          content_type: 'audio/webm',
          size_bytes: 1024
        })
      }),
      locals: makeLocals(adminUser)
    } as never);
    expect([400, 404]).toContain(res.status);
  });

  it('presign rechaza application/pdf → 400', async () => {
    const res = await presignPut({
      params: { auditId, sessionId },
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'doc.pdf',
          content_type: 'application/pdf',
          size_bytes: 1024
        })
      }),
      locals: makeLocals(adminUser)
    } as never);
    expect(res.status).toBe(400);
  });

  it('presign rechaza archivo > MAX_BYTES → 400', async () => {
    const res = await presignPut({
      params: { auditId, sessionId },
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'grande.webm',
          content_type: 'audio/webm',
          size_bytes: 104_857_601
        })
      }),
      locals: makeLocals(adminUser)
    } as never);
    expect(res.status).toBe(400);
  });

  it('presign acepta audio/webm válido → 200 con URL', async () => {
    const res = await presignPut({
      params: { auditId, sessionId },
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'grabacion.webm',
          content_type: 'audio/webm',
          size_bytes: 1024 * 1024
        })
      }),
      locals: makeLocals(adminUser)
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.upload_url).toContain('X-Amz-Signature');
    expect(body.data.r2_key).toMatch(/^audits\/.+\/_reunion\/.+\.webm$/);
  });

  it('confirm crea attachment con kind=recording y sesión en processing', async () => {
    // Presign para obtener r2_key
    const presignRes = await presignPut({
      params: { auditId, sessionId },
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'grabacion.webm',
          content_type: 'audio/webm',
          size_bytes: 1024 * 1024
        })
      }),
      locals: makeLocals(adminUser)
    } as never);

    const presignBody = await presignRes.json();
    const { r2_key } = presignBody.data;

    // Confirm
    const confirmRes = await confirmUpload({
      params: { auditId, sessionId },
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          r2_key,
          filename: 'grabacion.webm',
          content_type: 'audio/webm',
          size_bytes: 1024 * 1024
        })
      }),
      locals: makeLocals(adminUser)
    } as never);

    expect(confirmRes.status).toBe(200);
    const confirmBody = await confirmRes.json();
    expect(confirmBody.success).toBe(true);
    expect(confirmBody.data.attachment_id).toBeTruthy();

    // Verificar attachment en DB
    const [att] = await sql<{ kind: string }[]>`
      SELECT kind FROM attachment WHERE id = ${confirmBody.data.attachment_id}
    `;
    expect(att?.kind).toBe('recording');

    // Verificar que la sesión está en processing
    const [session] = await sql<{ status: string }[]>`
      SELECT status FROM reunion_session WHERE id = ${sessionId}
    `;
    expect(session?.status).toBe('processing');
  });
});
