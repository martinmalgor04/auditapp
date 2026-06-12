import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireAdminApi } from '$lib/server/api/guards';
import { getReportByAuditVersion, listEditHistory } from '$lib/server/db/informe-reports';
import { getAuditForReport } from '$lib/server/informe/access';

/** GET historial append-only de ediciones (R31, solo admin). */
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

  const entries = await listEditHistory(report.id);
  return apiSuccess(
    entries.map((e) => ({
      seq: e.seq,
      change_summary: e.changeSummary,
      edited_by: e.editedBy,
      edited_at: e.editedAt,
      client_draft: e.clientDraft
    }))
  );
};
