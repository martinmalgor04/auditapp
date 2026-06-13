import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireAdminApi } from '$lib/server/api/guards';
import { getReportByAuditVersion, setEjemplar } from '$lib/server/db/informe-reports';
import { getAuditForReport, informeErrorResponse } from '$lib/server/informe/access';

const bodySchema = z.object({ ejemplar: z.boolean() }).strict();

/** POST ejemplar (R10): solo admin, informe aprobado. */
export const POST: RequestHandler = async ({ params, locals, request }) => {
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
  if (report.status !== 'aprobado') {
    return apiError('Solo se puede marcar como ejemplar un informe aprobado', 409);
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return apiError('Body inválido', 400);
  }

  try {
    const updated = await setEjemplar(report.id, body.ejemplar);
    if (!updated) {
      return apiError('No se pudo actualizar el informe', 409);
    }
    return apiSuccess({
      report_id: updated.id,
      version: updated.version,
      ejemplar: updated.ejemplar
    });
  } catch (err) {
    return informeErrorResponse(err);
  }
};
