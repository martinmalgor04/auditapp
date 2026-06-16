import type { RequestHandler } from './$types';
import { requireStaffApi } from '$lib/server/api/require-staff';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { empresaUpdateSchema } from '$lib/server/crm/schemas';
import { EmpresaNotFoundError } from '$lib/server/crm/errors';
import { updateEmpresa } from '$lib/server/db/empresa';

/**
 * #23 Fase 4 (R19, R29): actualiza datos maestros y `relacion` de una empresa.
 *
 * Guard: staff (admin o técnico) — el cockpit y sus mutaciones requieren staff (R29). El import
 * masivo sigue siendo admin-only (endpoint aparte). 401 sin sesión, 403 si el rol no es staff.
 * Validación Zod estricta en frontera (`empresaUpdateSchema`); 404 si la empresa no existe.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
  const user = requireStaffApi(locals);
  if (user instanceof Response) {
    return user;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('JSON inválido', 400);
  }

  const parsed = empresaUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }

  if (Object.keys(parsed.data).length === 0) {
    return apiError('No hay cambios para guardar', 400);
  }

  try {
    const empresa = await updateEmpresa(params.id, parsed.data);
    return apiSuccess({ empresa });
  } catch (e) {
    if (e instanceof EmpresaNotFoundError) {
      return apiError(e.message, 404);
    }
    throw e;
  }
};
