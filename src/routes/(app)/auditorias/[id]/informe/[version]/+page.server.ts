import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/auth/guards';
import { getReportByAuditVersion } from '$lib/server/db/informe-reports';
import { listSharesByReport } from '$lib/server/db/informe-shares';
import { getAuditForReport } from '$lib/server/informe/access';
import { listAuditAssignments } from '$lib/server/db/audit-assignment';
import { buildInformeRenderModel } from '$lib/server/informe/model';
import { buildShareView, type ShareView } from '$lib/server/informe/share';

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
    // #32 (R23): técnico asignado a algún tipo de la auditoría; solo render
    // aprobado (R1) → directo a imprimir.
    const assignments = await listAuditAssignments(audit.id);
    const assignedIds = new Set(
      [audit.assignedTechId, ...assignments.map((a) => a.techId)].filter(
        (id): id is string => id !== null
      )
    );
    if (assignedIds.has(user.id) && report.status === 'aprobado') {
      redirect(303, `/auditorias/${audit.id}/informe/${report.version}/imprimir`);
    }
    error(403, 'No tenés permiso para esta acción');
  }

  // Entrega al cliente (#15, R8): share actual + historial, solo informe aprobado.
  let shares: ShareView[] = [];
  if (report.status === 'aprobado') {
    shares = (await listSharesByReport(report.id)).map((s) => buildShareView(s));
  }

  return {
    auditId: audit.id,
    shares,
    version: report.version,
    status: report.status,
    errorMessage: report.errorMessage,
    loomUrl: report.loomUrl,
    approvedBy: report.approvedBy,
    approvedAt: report.approvedAt ? report.approvedAt.toISOString() : null,
    ejemplar: report.ejemplar,
    isAdmin,
    clientDraft: report.clientDraft,
    internalDraft: report.internalDraft,
    upsellFindings: report.canonicalJson.upsell_findings,
    model:
      report.clientDraft && (report.status === 'borrador' || report.status === 'aprobado')
        ? buildInformeRenderModel(report, {
            startedAt: audit.startedAt,
            finishedAt: audit.finishedAt
          })
        : null
  };
};
