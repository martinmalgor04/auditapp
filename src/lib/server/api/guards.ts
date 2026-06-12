import type { AppUser } from '$lib/server/auth/types';

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/** 401 sin sesión, 403 si rol ≠ admin. Patrón extraído del export (R1). */
export function requireAdminApi(locals: App.Locals): AppUser | Response {
  if (!locals.user) {
    return jsonError('No autorizado', 401);
  }
  if (locals.user.role !== 'admin') {
    return jsonError('No tenés permiso para esta acción', 403);
  }
  return locals.user;
}

/** 401 sin sesión; devuelve el user con cualquier rol. */
export function requireSessionApi(locals: App.Locals): AppUser | Response {
  if (!locals.user) {
    return jsonError('No autorizado', 401);
  }
  return locals.user;
}

/**
 * Lectura de informes (decisión puerta 3, R1): admin siempre; técnico asignado
 * a la auditoría solo lectura de informes `aprobado`.
 */
export function requireReportReadAccess(
  locals: App.Locals,
  audit: { assignedTechId: string | null },
  report: { status: string } | null
): AppUser | Response {
  const user = requireSessionApi(locals);
  if (user instanceof Response) {
    return user;
  }
  if (user.role === 'admin') {
    return user;
  }
  if (
    user.role === 'tecnico' &&
    audit.assignedTechId === user.id &&
    report !== null &&
    report.status === 'aprobado'
  ) {
    return user;
  }
  return jsonError('No tenés permiso para esta acción', 403);
}
