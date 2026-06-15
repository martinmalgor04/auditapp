import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { insertTestAuditRow } from '../helpers/backoffice';
import { GET as listSessions, POST as createSession } from '../../src/routes/api/audits/[auditId]/reunion/sessions/+server';
import type { AppUser } from '../../src/lib/server/auth/types';
import type postgres from 'postgres';

function makeLocals(user: AppUser): App.Locals {
  return { user };
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('reunion session API', () => {
  let sql: postgres.Sql;
  let adminUser: AppUser;
  let techUser: AppUser;
  let otherTechUser: AppUser;
  let auditId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
  });

  beforeEach(async () => {
    adminUser = (await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar'))!;
    techUser = (await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar'))!;
    otherTechUser = (await findUserByEmail(sql, 'simon@serviciosysistemas.com.ar'))!;

    const row = await insertTestAuditRow(sql, {
      razonSocial: 'Session API Test SRL',
      status: 'en_relevamiento',
      assignedTechEmail: 'facu@serviciosysistemas.com.ar'
    });
    auditId = row.auditId;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('técnico no asignado recibe 403', async () => {
    const res = await listSessions({
      params: { auditId },
      locals: makeLocals(otherTechUser)
    } as never);
    expect(res.status).toBe(403);
  });

  it('admin puede listar sesiones → 200', async () => {
    const res = await listSessions({
      params: { auditId },
      locals: makeLocals(adminUser)
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('técnico asignado puede listar sesiones → 200', async () => {
    const res = await listSessions({
      params: { auditId },
      locals: makeLocals(techUser)
    } as never);
    expect(res.status).toBe(200);
  });

  it('auditoría en borrador → no permite crear sesión (403/400)', async () => {
    const { auditId: draftAuditId } = await insertTestAuditRow(sql, {
      razonSocial: 'Borrador Test SRL',
      status: 'borrador'
    });

    const res = await createSession({
      params: { auditId: draftAuditId },
      request: makeRequest({
        session_type: 'visita',
        consent_recorded_at: new Date().toISOString()
      }),
      locals: makeLocals(adminUser)
    } as never);

    expect([400, 403, 409]).toContain(res.status);
  });

  it('auditoría cerrada → no permite crear sesión', async () => {
    const { auditId: closedId } = await insertTestAuditRow(sql, {
      razonSocial: 'Cerrada Test SRL',
      status: 'cerrada'
    });

    const res = await createSession({
      params: { auditId: closedId },
      request: makeRequest({
        session_type: 'visita',
        consent_recorded_at: new Date().toISOString()
      }),
      locals: makeLocals(adminUser)
    } as never);

    expect([400, 403, 409]).toContain(res.status);
  });

  it('POST crea sesión con datos válidos → 201', async () => {
    const res = await createSession({
      params: { auditId },
      request: makeRequest({
        session_type: 'kickoff',
        consent_recorded_at: new Date().toISOString(),
        consent_note: 'Cliente autorizó'
      }),
      locals: makeLocals(adminUser)
    } as never);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.session_id).toBeTruthy();

    // Verificar consent_recorded_at y nombre del técnico en DB
    const [row] = await sql<{ consent_recorded_at: Date; started_by_name: string }[]>`
      SELECT rs.consent_recorded_at, au.name AS started_by_name
      FROM reunion_session rs
      JOIN app_user au ON au.id = rs.started_by
      WHERE rs.id = ${body.data.session_id}
    `;
    expect(row).toBeTruthy();
    expect(row?.consent_recorded_at).toBeTruthy();
    expect(row?.started_by_name).toBeTruthy();
  });
});
