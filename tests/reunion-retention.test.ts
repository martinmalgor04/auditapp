import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserIdByEmail } from './helpers/auth';
import { insertTestAuditRow } from './helpers/backoffice';
import {
  insertReunionSession,
  getReunionSessionById,
  updateReunionSessionStatus
} from '../src/lib/server/db/reunion-sessions';
import type postgres from 'postgres';

// Mock R2 delete para evitar llamadas reales
vi.mock('../src/lib/server/storage/r2-client', () => ({
  getAwsClient: () => ({
    fetch: vi.fn().mockResolvedValue({ ok: true, status: 200 })
  })
}));
vi.mock('../src/lib/server/storage/r2-config', () => ({
  getR2Env: () => ({
    R2_ENDPOINT: 'https://mock.r2.example.com',
    R2_BUCKET: 'test-bucket'
  })
}));
vi.mock('../src/lib/server/db/attachments', () => ({
  getAttachmentById: vi.fn().mockResolvedValue(null)
}));

describe('reunion retention', () => {
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
      razonSocial: 'Retention Test SRL',
      status: 'en_relevamiento'
    });
    auditId = aid;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('sesión vencida recibe archived_at', async () => {
    const sessionId = await insertReunionSession({
      auditId,
      startedBy: adminId,
      sessionType: 'visita',
      consentRecordedAt: new Date()
    });

    // Marcar como reviewed (califica para retención)
    await updateReunionSessionStatus(sessionId, 'reviewed');

    // Forzar created_at viejo (más de 1 día)
    await sql`
      UPDATE reunion_session
      SET created_at = now() - interval '2 days'
      WHERE id = ${sessionId}
    `;

    const { runReunionRetention } = await import('../src/lib/server/reunion/retention');

    process.env.REUNION_AUDIO_RETENTION_DAYS = '1';
    const result = await runReunionRetention();
    delete process.env.REUNION_AUDIO_RETENTION_DAYS;

    expect(result.archived).toBeGreaterThanOrEqual(1);

    const session = await getReunionSessionById(sessionId);
    expect(session?.archived_at).not.toBeNull();
  });

  it('sesión vigente NO recibe archived_at', async () => {
    const sessionId = await insertReunionSession({
      auditId,
      startedBy: adminId,
      sessionType: 'kickoff',
      consentRecordedAt: new Date()
    });

    await updateReunionSessionStatus(sessionId, 'reviewed');
    // created_at es reciente (now()), no debería archivar con retención de 365 días

    const { runReunionRetention } = await import('../src/lib/server/reunion/retention');
    process.env.REUNION_AUDIO_RETENTION_DAYS = '365';
    await runReunionRetention();
    delete process.env.REUNION_AUDIO_RETENTION_DAYS;

    const session = await getReunionSessionById(sessionId);
    expect(session?.archived_at).toBeNull();
  });
});
