import { error } from '@sveltejs/kit';
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
  if (!report || !report.clientDraft) {
    error(404, 'Informe no encontrado');
  }

  // Admin: borrador o aprobado. Técnico asignado: solo aprobado (R1).
  const isAdmin = user.role === 'admin';
  const isAssignedTech = user.role === 'tecnico' && audit.assignedTechId === user.id;
  const allowed =
    (isAdmin && (report.status === 'borrador' || report.status === 'aprobado')) ||
    (isAssignedTech && report.status === 'aprobado');
  if (!allowed) {
    error(403, 'No tenés permiso para esta acción');
  }

  return {
    model: buildInformeRenderModel(report),
    status: report.status
  };
};
