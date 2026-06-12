import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/auth/guards';
import { getReportByAuditVersion } from '$lib/server/db/informe-reports';
import { getAuditForReport } from '$lib/server/informe/access';
import { buildInformeRenderModel } from '$lib/server/informe/model';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = requireUser(locals);

  const audit = await getAuditForReport(params.id);
  if (!audit) {
    error(404, 'Auditoría no encontrada');
  }

  const version = Number(params.version);
  const report = Number.isInteger(version)
    ? await getReportByAuditVersion(audit.id, version)
    : null;
  if (!report) {
    error(404, 'Informe no encontrado');
  }

  const isAdmin = user.role === 'admin';
  if (!isAdmin) {
    // Técnico asignado: solo render aprobado (R1) → directo a imprimir.
    if (audit.assignedTechId === user.id && report.status === 'aprobado') {
      redirect(303, `/auditorias/${audit.id}/informe/${report.version}/imprimir`);
    }
    error(403, 'No tenés permiso para esta acción');
  }

  return {
    auditId: audit.id,
    version: report.version,
    status: report.status,
    errorMessage: report.errorMessage,
    loomUrl: report.loomUrl,
    approvedBy: report.approvedBy,
    approvedAt: report.approvedAt ? report.approvedAt.toISOString() : null,
    clientDraft: report.clientDraft,
    internalDraft: report.internalDraft,
    upsellFindings: report.canonicalJson.upsell_findings,
    model:
      report.clientDraft && (report.status === 'borrador' || report.status === 'aprobado')
        ? buildInformeRenderModel(report)
        : null
  };
};
