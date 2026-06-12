import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireAdminApi, requireSessionApi } from '$lib/server/api/guards';
import { listReportsByAudit, type AuditReportRow } from '$lib/server/db/informe-reports';
import { getAuditForReport, informeErrorResponse } from '$lib/server/informe/access';
import { createReport } from '$lib/server/informe/pipeline';

function toListItem(r: AuditReportRow) {
  return {
    report_id: r.id,
    version: r.version,
    status: r.status,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    edited_at: r.editedAt,
    approved_by: r.approvedBy,
    approved_at: r.approvedAt,
    error_message: r.errorMessage
  };
}

/** POST: crear versión de informe + pipeline en background (R1–R4, R6, R21). */
export const POST: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireAdminApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  try {
    const result = await createReport({ auditId: params.id!, userId: userOrResponse.id });
    return apiSuccess(
      { report_id: result.reportId, version: result.version, status: result.status },
      201
    );
  } catch (err) {
    return informeErrorResponse(err);
  }
};

/** GET: listado de versiones (R27). Técnico asignado: solo aprobadas (R1). */
export const GET: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireSessionApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }
  const user = userOrResponse;

  const audit = await getAuditForReport(params.id!);
  if (!audit) {
    return apiError('Auditoría no encontrada', 404);
  }

  if (user.role === 'admin') {
    const reports = await listReportsByAudit(audit.id);
    return apiSuccess(reports.map(toListItem));
  }

  if (user.role === 'tecnico' && audit.assignedTechId === user.id) {
    const reports = await listReportsByAudit(audit.id);
    return apiSuccess(reports.filter((r) => r.status === 'aprobado').map(toListItem));
  }

  return apiError('No tenés permiso para esta acción', 403);
};
