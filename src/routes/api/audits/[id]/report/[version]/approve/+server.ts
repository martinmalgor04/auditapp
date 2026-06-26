import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireAdminApi } from '$lib/server/api/guards';
import { approveReport, getReportByAuditVersion } from '$lib/server/db/informe-reports';
import { onInformeAprobado } from '$lib/server/email/notify';
import { getAuditForReport, informeErrorResponse } from '$lib/server/informe/access';

/** POST approve (R23): borrador → aprobado, explícito e inmutable. */
export const POST: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireAdminApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  const audit = await getAuditForReport(params.id!);
  if (!audit) {
    return apiError('Auditoría no encontrada', 404);
  }
  const version = Number(params.version);
  const report = Number.isInteger(version)
    ? await getReportByAuditVersion(audit.id, version)
    : null;
  if (!report) {
    return apiError('Informe no encontrado', 404);
  }
  if (report.status !== 'borrador') {
    return apiError('Solo se puede aprobar un informe en estado borrador', 409);
  }

  try {
    const approved = await approveReport(report.id, userOrResponse.id);
    void onInformeAprobado(audit.id, approved.id, approved.version);
    return apiSuccess({
      report_id: approved.id,
      version: approved.version,
      status: approved.status,
      approved_by: approved.approvedBy,
      approved_at: approved.approvedAt
    });
  } catch (err) {
    return informeErrorResponse(err);
  }
};
