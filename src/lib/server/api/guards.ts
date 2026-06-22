import type { AppUser } from '$lib/server/auth/types';
import { apiError } from './envelope';

/** 401 sin sesión, 403 si rol ≠ admin. Patrón extraído del export (R1). */
export function requireAdminApi(locals: App.Locals): AppUser | Response {
  if (!locals.user) {
    return apiError('No autorizado', 401);
  }
  if (locals.user.role !== 'admin') {
    return apiError('No tenés permiso para esta acción', 403);
  }
  return locals.user;
}

/** 401 sin sesión; devuelve el user con cualquier rol. */
export function requireSessionApi(locals: App.Locals): AppUser | Response {
  if (!locals.user) {
    return apiError('No autorizado', 401);
  }
  return locals.user;
}

/** 401 sin sesión, 403 si rol no es admin ni tecnico. */
export function requireStaffApi(locals: App.Locals): AppUser | Response {
  if (!locals.user) {
    return apiError('No autorizado', 401);
  }
  if (locals.user.role !== 'admin' && locals.user.role !== 'tecnico') {
    return apiError('No tenés permiso para esta acción', 403);
  }
  return locals.user;
}

/**
 * Lectura de informes (decisión puerta 3, R1; #32 R23): admin siempre; técnico
 * asignado a **algún** tipo de la auditoría solo lectura de informes `aprobado`.
 * El conjunto de técnicos asignados incluye, por compatibilidad, el
 * `assignedTechId` líder (que el backfill #32 también deja en `audit_assignment`).
 */
export function requireReportReadAccess(
  locals: App.Locals,
  audit: { assignedTechId: string | null; assignedTechIds?: string[] },
  report: { status: string } | null
): AppUser | Response {
  const user = requireSessionApi(locals);
  if (user instanceof Response) {
    return user;
  }
  if (user.role === 'admin') {
    return user;
  }
  const assignedIds = new Set(
    [audit.assignedTechId, ...(audit.assignedTechIds ?? [])].filter(
      (id): id is string => id !== null && id !== undefined
    )
  );
  if (
    user.role === 'tecnico' &&
    assignedIds.has(user.id) &&
    report !== null &&
    report.status === 'aprobado'
  ) {
    return user;
  }
  return apiError('No tenés permiso para esta acción', 403);
}
