import type { RequestHandler } from './$types';
import { apiError, apiSuccess, parseJsonBody } from '$lib/server/api/envelope';
import { requireStaffApi } from '$lib/server/api/guards';
import { techIsAssigned } from '$lib/server/db/audit-assignment';
import { crearEscaneo } from '$lib/server/escaneos/repo';
import { crearEscaneoInput } from '$lib/server/escaneos/schemas';
import { resolverEmpresaDeAuditoria } from '$lib/server/escaneos/api';
import { mapErrorEscaneo } from '$lib/server/escaneos/http';

/** Crea un escaneo en `pendiente` (R22). Staff: admin o técnico asignado (R6). */
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireStaffApi(locals);
  if (user instanceof Response) {
    return user;
  }

  const body = await parseJsonBody<unknown>(request);
  if (body instanceof Response) return body;

  const parsed = crearEscaneoInput.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }

  // R6 primero: un técnico no asignado recibe 403 aunque la auditoría no
  // exista (no se le confirma existencia ajena). El 404 de R22 lo ve admin.
  if (user.role !== 'admin' && !(await techIsAssigned(parsed.data.auditId, user.id))) {
    return apiError('No tenés permiso para esta acción', 403);
  }

  const empresaId = await resolverEmpresaDeAuditoria(parsed.data.auditId);
  if (!empresaId) {
    return apiError('Auditoría no encontrada', 404);
  }

  try {
    const escaneo = await crearEscaneo(empresaId, user.id, parsed.data);
    return apiSuccess(escaneo, 201);
  } catch (err) {
    return mapErrorEscaneo(err);
  }
};
