import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireAdminApi } from '$lib/server/api/guards';
import { getReportByAuditVersion, type AuditReportRow } from '$lib/server/db/informe-reports';
import { listSharesByReport, revokeShare } from '$lib/server/db/informe-shares';
import { getAuditForReport, informeErrorResponse } from '$lib/server/informe/access';
import { InformeShareNotFoundError } from '$lib/server/informe/errors';
import { createShareSchema } from '$lib/server/informe/schemas';
import { buildShareView, createReportShare } from '$lib/server/informe/share';

async function resolveReport(auditId: string, rawVersion: string): Promise<AuditReportRow | null> {
  const audit = await getAuditForReport(auditId);
  if (!audit) {
    return null;
  }
  const version = Number(rawVersion);
  return Number.isInteger(version) ? getReportByAuditVersion(audit.id, version) : null;
}

/** POST: genera el link de entrega; si hay activo lo revoca y crea uno nuevo (R3, R5, R7). */
export const POST: RequestHandler = async ({ params, locals, request }) => {
  const userOrResponse = requireAdminApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  const report = await resolveReport(params.id!, params.version!);
  if (!report) {
    return apiError('Informe no encontrado', 404);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createShareSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return apiError('Expiración inválida: entre 1 y 365 días, o null sin vencimiento', 400);
  }

  try {
    const share = await createReportShare({
      reportId: report.id,
      createdBy: userOrResponse.id,
      expiresInDays: parsed.data.expires_in_days
    });
    const [view] = await listSharesByReport(report.id);
    return apiSuccess({ ...buildShareView(view), token: share.token }, 201);
  } catch (err) {
    return informeErrorResponse(err);
  }
};

/** GET: share actual (o último) + historial de envíos y vistas (R8, R9). */
export const GET: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireAdminApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  const report = await resolveReport(params.id!, params.version!);
  if (!report) {
    return apiError('Informe no encontrado', 404);
  }

  const shares = await listSharesByReport(report.id);
  if (shares.length === 0) {
    return apiSuccess(null);
  }
  const [current, ...rest] = shares.map((s) => buildShareView(s));
  return apiSuccess({ ...current, history: rest });
};

/** DELETE: revoca el link activo sin borrar la fila (R6). */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireAdminApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  const report = await resolveReport(params.id!, params.version!);
  if (!report) {
    return apiError('Informe no encontrado', 404);
  }

  const revoked = await revokeShare(report.id);
  if (!revoked) {
    return informeErrorResponse(new InformeShareNotFoundError());
  }
  return apiSuccess({ revoked_at: revoked.revokedAt?.toISOString() ?? null });
};
