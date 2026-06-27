/**
 * Tests API #51 — POST /api/audits/[id]/report/[version]/enviar (R2, R3, R5, R7, R8).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { seedReportForShare } from '../fixtures/informe-share';
import type { AppUser } from '../../src/lib/server/auth/types';
import { POST as enviarPost } from '../../src/routes/api/audits/[id]/report/[version]/enviar/+server';
import { resetMailTransportForTests, setMailTransportForTests } from '../../src/lib/server/email/transport';

// Mock de enviarInforme para poder simular fallo (R8)
vi.mock('../../src/lib/server/informe/enviar', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/lib/server/informe/enviar')>();
  return { ...original, enviarInforme: vi.fn().mockImplementation(original.enviarInforme) };
});

function locals(user: AppUser | null) {
  return { user } as never;
}

function params(auditId: string, version: number) {
  return { id: auditId, version: String(version) };
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/enviar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('POST enviar informe (R2, R3, R5, R7, R8)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
    resetMailTransportForTests();
    setMailTransportForTests({ sendMail: vi.fn().mockResolvedValue({ messageId: 'x' }) });
    process.env.NODE_ENV = 'test';
    delete process.env.SMTP_HOST;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('401 sin sesión (R5)', async () => {
    const { auditId, version } = await seedReportForShare(sql, 'aprobado');
    const res = await enviarPost({
      params: params(auditId, version),
      locals: locals(null),
      request: postRequest({ to: 'cliente@empresa.com' })
    } as never);
    expect(res.status).toBe(401);
  });

  it('403 técnico no asignado (R5)', async () => {
    const { auditId, version, tech } = await seedReportForShare(sql, 'aprobado');
    // Revocar cualquier asignación que exista del técnico para esta auditoría
    await sql`DELETE FROM audit_assignment WHERE audit_id = ${auditId} AND tech_id = ${tech.id}`;
    await sql`UPDATE audit SET assigned_tech_id = NULL WHERE id = ${auditId}`;

    const res = await enviarPost({
      params: params(auditId, version),
      locals: locals(tech),
      request: postRequest({ to: 'cliente@empresa.com' })
    } as never);
    expect(res.status).toBe(403);
  });

  it('409 informe borrador (R2)', async () => {
    const { auditId, version, admin, reportId } = await seedReportForShare(sql, 'borrador');
    const res = await enviarPost({
      params: params(auditId, version),
      locals: locals(admin),
      request: postRequest({ to: 'cliente@empresa.com' })
    } as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);

    const [count] = await sql<{ count: string }[]>`
      SELECT count(*) FROM email_log WHERE template = 'envio_informe_cliente'
      AND id IN (
        SELECT id FROM email_log
        WHERE to_email = 'cliente@empresa.com' AND created_at > now() - interval '10 seconds'
      )
    `;
    // sendEmail no debió haberse llamado, así que no hay log nuevo
    expect(Number(count.count)).toBe(0);
    // Verificar explícitamente que el reportId sigue en borrador
    const [r] = await sql<{ status: string }[]>`SELECT status FROM audit_report WHERE id = ${reportId}`;
    expect(r.status).toBe('borrador');
  });

  it('400 destinatario inválido (R3)', async () => {
    const { auditId, version, admin } = await seedReportForShare(sql, 'aprobado');
    const res = await enviarPost({
      params: params(auditId, version),
      locals: locals(admin),
      request: postRequest({ to: 'no-es-email' })
    } as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('400 sin campo to (R3)', async () => {
    const { auditId, version, admin } = await seedReportForShare(sql, 'aprobado');
    const res = await enviarPost({
      params: params(auditId, version),
      locals: locals(admin),
      request: postRequest({})
    } as never);
    expect(res.status).toBe(400);
  });

  it('200 admin envía informe y queda una fila email_log (R5, R7)', async () => {
    const { auditId, version, admin } = await seedReportForShare(sql, 'aprobado');
    const toEmail = `envio-admin-${Date.now()}@test.com`;

    // Contar filas antes
    const [before] = await sql<{ count: string }[]>`
      SELECT count(*) FROM email_log WHERE template = 'envio_informe_cliente' AND to_email = ${toEmail}
    `;

    const res = await enviarPost({
      params: params(auditId, version),
      locals: locals(admin),
      request: postRequest({ to: toEmail })
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.to).toBe(toEmail);

    const [after] = await sql<{ count: string }[]>`
      SELECT count(*) FROM email_log WHERE template = 'envio_informe_cliente' AND to_email = ${toEmail}
    `;
    expect(Number(after.count)).toBe(Number(before.count) + 1);
  });

  it('200 técnico asignado puede enviar (R5)', async () => {
    const { auditId, version, tech } = await seedReportForShare(sql, 'aprobado');
    // El técnico está asignado gracias al fixture (seedCanonicalAuditFixture asigna facu)
    const toEmail = `envio-tech-${Date.now()}@test.com`;

    const res = await enviarPost({
      params: params(auditId, version),
      locals: locals(tech),
      request: postRequest({ to: toEmail })
    } as never);
    expect(res.status).toBe(200);
  });

  it('reenvío agrega segunda fila email_log (R7)', async () => {
    const { auditId, version, admin } = await seedReportForShare(sql, 'aprobado');
    const toEmail = `reenvio-${Date.now()}@test.com`;

    await enviarPost({
      params: params(auditId, version),
      locals: locals(admin),
      request: postRequest({ to: toEmail })
    } as never);

    await enviarPost({
      params: params(auditId, version),
      locals: locals(admin),
      request: postRequest({ to: toEmail })
    } as never);

    const [row] = await sql<{ count: string }[]>`
      SELECT count(*) FROM email_log WHERE template = 'envio_informe_cliente' AND to_email = ${toEmail}
    `;
    expect(Number(row.count)).toBe(2);
  });

  it('502 cuando sendEmail falla — mensaje genérico sin SMTP_* (R8)', async () => {
    const { auditId, version, admin } = await seedReportForShare(sql, 'aprobado');

    // Mockear enviarInforme para que devuelva fallido (R8)
    const enviarModule = await import('../../src/lib/server/informe/enviar');
    vi.mocked(enviarModule.enviarInforme).mockResolvedValueOnce({
      ok: false,
      status: 'fallido',
      error: 'No se pudo enviar el informe por email'
    });

    const toEmail = `fallo-${Date.now()}@test.com`;
    const res = await enviarPost({
      params: params(auditId, version),
      locals: locals(admin),
      request: postRequest({ to: toEmail })
    } as never);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    // No debe filtrar detalles SMTP al cliente
    expect(body.error).not.toContain('SMTP_');
    expect(body.error).not.toContain('CONNECTION_REFUSED');
  });
});
