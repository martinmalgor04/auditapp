import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserIdByEmail } from './helpers/auth';
import { insertTestAuditRow } from './helpers/backoffice';
import {
  insertReunionSession,
  getReunionSessionById
} from '../src/lib/server/db/reunion-sessions';
import type postgres from 'postgres';

// Mock de STT y LLM para que el pipeline directo use datos fijos
vi.mock('../src/lib/server/reunion/pipeline/stt', () => ({
  getSttAdapter: vi.fn(() => ({
    async transcribe() {
      return {
        full_text: 'El cliente usa Tango hace 5 años.',
        provider: 'mock',
        language: 'es'
      };
    }
  })),
  createMockSttAdapter: (text?: string) => ({
    async transcribe() {
      return {
        full_text: text ?? 'Mock transcript.',
        provider: 'mock',
        language: 'es'
      };
    }
  })
}));

vi.mock('../src/lib/server/reunion/pipeline/extract', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/server/reunion/pipeline/extract')>();
  return {
    ...original,
    extractProposals: vi.fn().mockResolvedValue([])
  };
});

// Mock presignGet para evitar llamadas a R2
vi.mock('../src/lib/server/storage/presign', () => ({
  presignGet: vi.fn().mockResolvedValue({ downloadUrl: 'https://mock-r2/audio.webm' })
}));

// Mock getAttachmentById
vi.mock('../src/lib/server/db/attachments', () => ({
  getAttachmentById: vi.fn().mockResolvedValue({
    id: 'mock-attachment-id',
    r2_key: 'audits/mock-audit/_reunion/mock.webm',
    content_type: 'audio/webm',
    filename: 'grabacion.webm',
    size_bytes: 1024
  })
}));

describe('reunion pipeline (direct mode)', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let auditId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
  });

  beforeEach(async () => {
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const { auditId: aid } = await insertTestAuditRow(sql, {
      razonSocial: 'Test Pipeline SA',
      status: 'en_relevamiento'
    });
    auditId = aid;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('pipeline exitoso lleva sesión a ready_for_review', async () => {
    const sessionId = await insertReunionSession({
      auditId,
      startedBy: adminId,
      sessionType: 'visita',
      consentRecordedAt: new Date()
    });

    // Crear attachment real con UUID válido en la DB
    const mockAttachmentId = crypto.randomUUID();
    await sql`
      INSERT INTO attachment (id, audit_id, item_id, r2_key, filename, content_type, size_bytes, kind, uploaded_by)
      VALUES (
        ${mockAttachmentId}, ${auditId}, NULL,
        ${'audits/' + auditId + '/_reunion/' + mockAttachmentId + '.webm'},
        'grabacion.webm', 'audio/webm', 1024, 'recording', ${adminId}
      )
    `;
    await sql`
      UPDATE reunion_session
      SET attachment_id = ${mockAttachmentId}, status = 'processing', updated_at = now()
      WHERE id = ${sessionId}
    `;

    const { processReunionJobDirect } = await import('../src/lib/server/reunion/pipeline/direct');
    await processReunionJobDirect(sessionId);

    const session = await getReunionSessionById(sessionId);
    expect(session?.status).toBe('ready_for_review');
  });

  it('fallo STT lleva sesión a error', async () => {
    const { getSttAdapter } = await import('../src/lib/server/reunion/pipeline/stt');
    vi.mocked(getSttAdapter).mockReturnValueOnce({
      async transcribe() {
        throw new Error('Whisper timeout');
      }
    });

    const sessionId = await insertReunionSession({
      auditId,
      startedBy: adminId,
      sessionType: 'kickoff',
      consentRecordedAt: new Date()
    });

    // Crear attachment real con UUID válido en la DB
    const mockAttachmentId = crypto.randomUUID();
    await sql`
      INSERT INTO attachment (id, audit_id, item_id, r2_key, filename, content_type, size_bytes, kind, uploaded_by)
      VALUES (
        ${mockAttachmentId}, ${auditId}, NULL,
        ${'audits/' + auditId + '/_reunion/' + mockAttachmentId + '.webm'},
        'grabacion.webm', 'audio/webm', 1024, 'recording', ${adminId}
      )
    `;
    await sql`
      UPDATE reunion_session
      SET attachment_id = ${mockAttachmentId}, status = 'processing', updated_at = now()
      WHERE id = ${sessionId}
    `;

    const { processReunionJobDirect } = await import('../src/lib/server/reunion/pipeline/direct');
    await processReunionJobDirect(sessionId);

    const session = await getReunionSessionById(sessionId);
    expect(session?.status).toBe('error');
    expect(session?.error_message).toContain('Whisper timeout');
  });

  it('tras pipeline exitoso NO hay audit_response con source=reunion_ia (R15)', async () => {
    const sessionId = await insertReunionSession({
      auditId,
      startedBy: adminId,
      sessionType: 'visita',
      consentRecordedAt: new Date()
    });

    // Crear attachment real con UUID válido en la DB
    const mockAttachmentId = crypto.randomUUID();
    await sql`
      INSERT INTO attachment (id, audit_id, item_id, r2_key, filename, content_type, size_bytes, kind, uploaded_by)
      VALUES (
        ${mockAttachmentId}, ${auditId}, NULL,
        ${'audits/' + auditId + '/_reunion/' + mockAttachmentId + '.webm'},
        'grabacion.webm', 'audio/webm', 1024, 'recording', ${adminId}
      )
    `;
    await sql`
      UPDATE reunion_session
      SET attachment_id = ${mockAttachmentId}, status = 'processing', updated_at = now()
      WHERE id = ${sessionId}
    `;

    const { processReunionJobDirect } = await import('../src/lib/server/reunion/pipeline/direct');
    await processReunionJobDirect(sessionId);

    // No debe haber audit_response con source=reunion_ia
    const [row] = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM audit_response
      WHERE audit_id = ${auditId} AND source = 'reunion_ia'
    `;
    expect(parseInt(row?.count ?? '0', 10)).toBe(0);
  });
});
