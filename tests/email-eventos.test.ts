import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { listEmailLogByTemplate } from '../src/lib/server/db/email-log';
import { createAudit } from '../src/lib/server/backoffice/audits';
import { submitBriefing } from '../src/lib/server/briefing/submit';
import { approveReport } from '../src/lib/server/db/informe-reports';
import { confirmClosure } from '../src/lib/server/scoring/persist';
import { submitSurveyResponse } from '../src/lib/server/informe/survey';
import { createReportShare } from '../src/lib/server/informe/share';
import {
  onAuditoriaAsignada,
  onInformeAprobado,
  resolveInternalRecipientUserIds
} from '../src/lib/server/email/notify';
import {
  resetMailTransportForTests,
  setMailTransportForTests
} from '../src/lib/server/email/transport';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserIdByEmail, findUserByEmail } from './helpers/auth';
import { insertTestEmpresa } from './helpers/empresa';
import { insertLegacyMixedAuditRow } from './helpers/backoffice';
import { seedBriefingAuditFixture, BRIEFING_FIXTURE_TOKEN } from './fixtures/briefing-audit';
import { seedClosureAuditFixture } from './fixtures/closure-audit';
import { seedReportForShare } from './fixtures/informe-share';
import { resetInformeShareRateLimit } from '../src/lib/server/informe/rate-limit';

async function flushNotify(): Promise<void> {
  await new Promise((r) => setTimeout(r, 150));
}

async function countLogs(template: string): Promise<number> {
  return (await listEmailLogByTemplate(template as never)).length;
}

describe('email eventos internos (#49 R8–R13, R16–R17)', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let itTech: string;
  let erpTech: string;

  beforeAll(async () => {
    sql = await setupTestDb();
  }, 30_000);

  beforeEach(async () => {
    setSqlForTests(sql);
    await sql`TRUNCATE email_log RESTART IDENTITY`;
    resetMailTransportForTests();
    process.env.NODE_ENV = 'test';
    delete process.env.SMTP_HOST;
    resetInformeShareRateLimit();

    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    itTech = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
    erpTech = await findUserIdByEmail(sql, 'simon@serviciosysistemas.com.ar');

    await sql`
      UPDATE app_user SET notify_internal_email = true, active = true
      WHERE id IN (${adminId}, ${itTech}, ${erpTech})
    `;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('(R8) asignar dos técnicos dispara aviso_auditoria_asignada a cada uno', async () => {
    const { auditId } = await insertLegacyMixedAuditRow(sql, {
      razonSocial: 'Email Assign SA',
      itTechId: itTech,
      erpTechId: erpTech,
      createdBy: adminId
    });

    await onAuditoriaAsignada(auditId, [itTech, erpTech]);
    await flushNotify();

    const rows = await listEmailLogByTemplate('aviso_auditoria_asignada');
    const emails = rows.map((r) => r.toEmail).sort();
    expect(emails).toEqual(
      [
        'admin@serviciosysistemas.com.ar',
        'facu@serviciosysistemas.com.ar',
        'simon@serviciosysistemas.com.ar'
      ].sort()
    );
  });

  it('(R8) re-guardar asignación sin técnicos nuevos no reenvía', async () => {
    const clientId = await insertTestEmpresa(sql, { razonSocial: 'Email No Resend SA' });
    const { id } = await createAudit(
      {
        clientId,
        types: ['it'],
        segment: 'A',
        techByType: { it: itTech },
        scheduledAt: '2026-08-02',
        cabResponses: {}
      },
      adminId
    );
    await flushNotify();
    const before = await countLogs('aviso_auditoria_asignada');

    await onAuditoriaAsignada(id, []);
    await flushNotify();
    const after = await countLogs('aviso_auditoria_asignada');
    expect(after).toBe(before);
  });

  it('(R12) técnico con opt-out no recibe aviso de asignación', async () => {
    await sql`UPDATE app_user SET notify_internal_email = false WHERE id = ${itTech}`;
    const clientId = await insertTestEmpresa(sql, { razonSocial: 'Email Optout SA' });
    await createAudit(
      {
        clientId,
        types: ['it'],
        segment: 'A',
        techByType: { it: itTech },
        scheduledAt: '2026-08-03',
        cabResponses: {}
      },
      adminId
    );
    await flushNotify();

    const rows = await listEmailLogByTemplate('aviso_auditoria_asignada');
    expect(rows.some((r) => r.toEmail === 'facu@serviciosysistemas.com.ar')).toBe(false);
  });

  it('(R9) submitBriefing dispara aviso_briefing_completado', async () => {
    const { auditId } = await seedBriefingAuditFixture(sql, { status: 'briefing_enviado' });
    await sql`UPDATE audit SET created_by = ${adminId} WHERE id = ${auditId}`;

    await submitBriefing(BRIEFING_FIXTURE_TOKEN);
    await flushNotify();

    const rows = await listEmailLogByTemplate('aviso_briefing_completado');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].toEmail).toBe('facu@serviciosysistemas.com.ar');
  });

  it('(R9) briefing ya completo no reenvía', async () => {
    await seedBriefingAuditFixture(sql, { status: 'briefing_completo' });
    await submitBriefing(BRIEFING_FIXTURE_TOKEN);
    await flushNotify();

    const rows = await listEmailLogByTemplate('aviso_briefing_completado');
    expect(rows).toHaveLength(0);
  });

  it('(R10) aprobar informe dispara aviso_informe_aprobado', async () => {
    const { auditId, reportId, admin } = await seedReportForShare(sql, 'borrador');
    await sql`UPDATE audit SET created_by = ${admin.id} WHERE id = ${auditId}`;

    const approved = await approveReport(reportId, admin.id);
    await onInformeAprobado(auditId, approved.id, approved.version);
    await flushNotify();

    const rows = await listEmailLogByTemplate('aviso_informe_aprobado');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.toEmail === 'facu@serviciosysistemas.com.ar')).toBe(true);
  });

  it('(R16) confirmClosure dispara aviso_auditoria_cerrada', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre' });
    const tech = (await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar'))!;
    await sql`UPDATE audit SET created_by = ${adminId} WHERE id = ${auditId}`;

    await confirmClosure(auditId, tech);
    await flushNotify();

    const rows = await listEmailLogByTemplate('aviso_auditoria_cerrada');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('(R16) reabrir y re-cerrar vuelve a enviar aviso', async () => {
    const { auditId } = await seedClosureAuditFixture(sql, { status: 'en_cierre' });
    const tech = (await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar'))!;
    await sql`UPDATE audit SET created_by = ${adminId} WHERE id = ${auditId}`;

    await confirmClosure(auditId, tech);
    await flushNotify();
    const first = await countLogs('aviso_auditoria_cerrada');

    await sql`UPDATE audit SET status = 'en_cierre', closed_at = NULL WHERE id = ${auditId}`;
    await confirmClosure(auditId, tech);
    await flushNotify();
    const second = await countLogs('aviso_auditoria_cerrada');
    expect(second).toBeGreaterThan(first);
  });

  it('(R17) respuesta de encuesta dispara aviso_feedback_cliente con valoración', async () => {
    const { reportId, auditId, admin } = await seedReportForShare(sql, 'aprobado');
    await sql`UPDATE audit SET created_by = ${admin.id} WHERE id = ${auditId}`;
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });

    const result = await submitSurveyResponse({
      token: share.token,
      raw: {
        valoracion_global: '5',
        claridad_informe: '4',
        conforme_hallazgos: 'true'
      },
      clientIp: '10.0.0.1'
    });
    expect(result.ok).toBe(true);
    await flushNotify();

    const rows = await listEmailLogByTemplate('aviso_feedback_cliente');
    expect(rows.length).toBeGreaterThan(0);
    const rendered = rows[0];
    expect(rendered.template).toBe('aviso_feedback_cliente');
  });

  it('(R17) segundo submit de encuesta no reenvía', async () => {
    const { reportId, auditId, admin } = await seedReportForShare(sql, 'aprobado');
    await sql`UPDATE audit SET created_by = ${admin.id} WHERE id = ${auditId}`;
    const share = await createReportShare({ reportId, createdBy: admin.id, expiresInDays: 90 });
    const payload = {
      valoracion_global: '3',
      claridad_informe: '3',
      conforme_hallazgos: 'false'
    };

    await submitSurveyResponse({ token: share.token, raw: payload, clientIp: '10.0.0.2' });
    await flushNotify();
    const first = await countLogs('aviso_feedback_cliente');

    const dup = await submitSurveyResponse({ token: share.token, raw: payload, clientIp: '10.0.0.2' });
    expect(dup.ok).toBe(false);
    await flushNotify();
    const second = await countLogs('aviso_feedback_cliente');
    expect(second).toBe(first);
  });

  it('(R11) created_by admin incluye admin + técnicos asignados deduplicados', async () => {
    const { auditId } = await seedBriefingAuditFixture(sql, { status: 'briefing_enviado' });
    await sql`UPDATE audit SET created_by = ${adminId} WHERE id = ${auditId}`;

    const ids = await resolveInternalRecipientUserIds(auditId, 'briefing_completado');
    expect(ids).toContain(adminId);
    expect(ids).toContain(itTech);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('(R11) created_by no admin → fallback a todos los admins activos', async () => {
    const { auditId } = await seedBriefingAuditFixture(sql, { status: 'briefing_enviado' });
    await sql`UPDATE audit SET created_by = ${itTech} WHERE id = ${auditId}`;

    const ids = await resolveInternalRecipientUserIds(auditId, 'briefing_completado');
    expect(ids).toContain(adminId);
    expect(ids).toContain(itTech);
  });

  it('(R12) opt-out excluye usuario de resolveInternalRecipientUserIds', async () => {
    const { auditId } = await seedBriefingAuditFixture(sql, { status: 'briefing_enviado' });
    await sql`UPDATE app_user SET notify_internal_email = false WHERE id = ${itTech}`;

    const ids = await resolveInternalRecipientUserIds(auditId, 'briefing_completado');
    expect(ids).not.toContain(itTech);
  });

  it('(R13) transporte que siempre falla no impide aprobar informe', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMTP_HOST = 'smtp.test.local';
    setMailTransportForTests({
      sendMail: vi.fn().mockRejectedValue(new Error('smtp permanent failure'))
    });

    const { auditId, reportId, admin } = await seedReportForShare(sql, 'borrador');
    await sql`UPDATE audit SET created_by = ${admin.id} WHERE id = ${auditId}`;

    const approved = await approveReport(reportId, admin.id);
    await onInformeAprobado(auditId, approved.id, approved.version);
    await flushNotify();

    const rows = await listEmailLogByTemplate('aviso_informe_aprobado');
    expect(rows.some((r) => r.status === 'fallido')).toBe(true);

    const [report] = await sql<{ status: string }[]>`
      SELECT status FROM audit_report WHERE id = ${reportId}
    `;
    expect(report.status).toBe('aprobado');
  });
});
