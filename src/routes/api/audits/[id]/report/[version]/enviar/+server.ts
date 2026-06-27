/**
 * POST /api/audits/[id]/report/[version]/enviar — #51
 *
 * Envía el informe aprobado al contacto del cliente.
 * Guards: requireReportReadAccess (admin o técnico asignado), status aprobado,
 * Zod destinatario.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireReportReadAccess } from '$lib/server/api/guards';
import { getReportByAuditVersion } from '$lib/server/db/informe-reports';
import { getEmpresaById } from '$lib/server/db/empresa';
import { getAuditForReport } from '$lib/server/informe/access';
import { listAuditAssignments } from '$lib/server/db/audit-assignment';
import { enviarInformeSchema, enviarInforme } from '$lib/server/informe/enviar';

export const POST: RequestHandler = async ({ params, locals, request }): Promise<Response> => {
  // Cargar auditoría
  const audit = await getAuditForReport(params.id!);
  if (!audit) {
    return apiError('Auditoría no encontrada', 404);
  }

  // Cargar informe
  const version = Number(params.version);
  if (!Number.isInteger(version) || version < 1) {
    return apiError('Versión inválida', 404);
  }
  const report = await getReportByAuditVersion(audit.id, version);
  if (!report) {
    return apiError('Informe no encontrado', 404);
  }

  // R5: guard admin o técnico asignado
  const assignments = await listAuditAssignments(audit.id);
  const userOrResponse = requireReportReadAccess(
    locals,
    { ...audit, assignedTechIds: assignments.map((a) => a.techId) },
    report
  );
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }
  const user = userOrResponse;

  // R2: guard estado aprobado
  if (report.status !== 'aprobado') {
    return apiError('El informe debe estar aprobado para enviarse', 409);
  }

  // R3: validar destinatario con Zod
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('JSON inválido', 400);
  }
  const parsed = enviarInformeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Destinatario inválido: debe ser un email válido', 400);
  }
  const { to } = parsed.data;

  // Cargar empresa para el nombre de contacto
  const empresa = audit.empresaId ? await getEmpresaById(audit.empresaId) : null;
  const empresaNombre = empresa?.razonSocial ?? 'Cliente';

  // R4, R7, R8: enviar
  const result = await enviarInforme({
    report,
    empresaNombre,
    to,
    userId: user.id
  });

  if (!result.ok) {
    // R8: 502 con mensaje genérico
    return apiError(result.error, 502);
  }

  return apiSuccess({ status: result.status, to: result.to });
};
