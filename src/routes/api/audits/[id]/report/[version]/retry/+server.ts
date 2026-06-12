import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireAdminApi } from '$lib/server/api/guards';
import { getReportByAuditVersion } from '$lib/server/db/informe-reports';
import { getAuditForReport, informeErrorResponse } from '$lib/server/informe/access';
import { assertAnthropicConfigured } from '$lib/server/informe/claude';
import { runInformePipeline } from '$lib/server/informe/pipeline';

/** POST retry (R22): error → generando, misma fila y versión. */
export const POST: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireAdminApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  try {
    assertAnthropicConfigured();

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
    if (report.status !== 'error') {
      return apiError('Solo se puede reintentar un informe en estado error', 409);
    }

    void runInformePipeline(report.id);

    return apiSuccess({ report_id: report.id, version: report.version, status: 'generando' }, 202);
  } catch (err) {
    return informeErrorResponse(err);
  }
};
