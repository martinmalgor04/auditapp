import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
import { getAuditById } from '$lib/server/backoffice/audits';
import { listReunionSessionsByAudit } from '$lib/server/db/reunion-sessions';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = requireStaff(locals);

  const audit = await getAuditById(params.id, user);
  if (!audit) {
    error(404, 'Auditoría no encontrada');
  }

  // Verificar permisos: admin siempre; técnico solo si es asignado
  const isAdmin = user.role === 'admin';
  if (!isAdmin && audit.assignedTechId !== user.id) {
    error(403, 'No tenés acceso a esta auditoría');
  }

  const sessions = await listReunionSessionsByAudit(params.id);

  return {
    audit,
    sessions,
    user: { id: user.id, name: user.name, role: user.role },
    isAdmin
  };
};
