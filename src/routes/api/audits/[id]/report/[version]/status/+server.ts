import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireAdminApi } from '$lib/server/api/guards';
import { getReportByAuditVersion } from '$lib/server/db/informe-reports';
import { expireStaleGenerating } from '$lib/server/informe/guard';
import { getAuditForReport } from '$lib/server/informe/access';

/** GET estado para polling (R15) aplicando guard de timeout (R14). */
export const GET: RequestHandler = async ({ params, locals }) => {
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

  const fresh = await expireStaleGenerating(report);

  return apiSuccess({
    report_id: fresh.id,
    version: fresh.version,
    status: fresh.status,
    error_message: fresh.errorMessage,
    updated_at: fresh.updatedAt
  });
};
