import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { insertTestAuditRow } from '../helpers/backoffice';
import { GET as statusHandler } from '../../src/routes/api/audits/[auditId]/reunion/sessions/[sessionId]/status/+server';
import {
  insertReunionSession,
  updateReunionSessionStatus
} from '../../src/lib/server/db/reunion-sessions';
import type { AppUser } from '../../src/lib/server/auth/types';
import type postgres from 'postgres';

function makeLocals(user: AppUser): App.Locals {
  return { user };
}

describe('reunion status API', () => {
  let sql: postgres.Sql;
  let adminUser: AppUser;
  let auditId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
  });

  beforeEach(async () => {
    adminUser = (await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar'))!;
    const row = await insertTestAuditRow(sql, {
      razonSocial: 'Status Test SRL',
      status: 'en_relevamiento'
    });
    auditId = row.auditId;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('GET status devuelve status, transcript_status, error_message', async () => {
    const sessionId = await insertReunionSession({
      auditId,
      startedBy: adminUser.id,
      sessionType: 'visita',
      consentRecordedAt: new Date()
    });

    await updateReunionSessionStatus(sessionId, 'ready_for_review');

    const res = await statusHandler({
      params: { auditId, sessionId },
      locals: makeLocals(adminUser)
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('status');
    expect(body.data).toHaveProperty('transcript_status');
    expect(body.data.status).toBe('ready_for_review');
  });

  it('sesión processing → status aggregado processing', async () => {
    const sessionId = await insertReunionSession({
      auditId,
      startedBy: adminUser.id,
      sessionType: 'kickoff',
      consentRecordedAt: new Date()
    });

    await updateReunionSessionStatus(sessionId, 'processing');

    const res = await statusHandler({
      params: { auditId, sessionId },
      locals: makeLocals(adminUser)
    } as never);

    const body = await res.json();
    expect(body.data.status).toBe('processing');
  });

  it('sesión error → status aggregado error', async () => {
    const sessionId = await insertReunionSession({
      auditId,
      startedBy: adminUser.id,
      sessionType: 'otro',
      consentRecordedAt: new Date()
    });

    await updateReunionSessionStatus(sessionId, 'error', 'STT timeout');

    const res = await statusHandler({
      params: { auditId, sessionId },
      locals: makeLocals(adminUser)
    } as never);

    const body = await res.json();
    expect(body.data.status).toBe('error');
    expect(body.data.error_message).toContain('STT timeout');
  });

  it('sesión de otra auditoría → 404', async () => {
    const { auditId: otherAuditId } = await insertTestAuditRow(sql, {
      razonSocial: 'Otra auditoría',
      status: 'en_relevamiento'
    });

    const sessionId = await insertReunionSession({
      auditId: otherAuditId,
      startedBy: adminUser.id,
      sessionType: 'visita',
      consentRecordedAt: new Date()
    });

    const res = await statusHandler({
      params: { auditId, sessionId }, // auditId incorrecto
      locals: makeLocals(adminUser)
    } as never);

    expect(res.status).toBe(404);
  });
});
