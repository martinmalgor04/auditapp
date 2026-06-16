import type { RequestHandler } from './$types';
import { requireStaffApi } from '$lib/server/api/require-staff';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { empresaOverrideSchema } from '$lib/server/crm/schemas';
import { EmpresaNotFoundError } from '$lib/server/crm/errors';
import { setEstadoOverride } from '$lib/server/db/empresa';

/**
 * #23 Fase 5 (R15, R23, R29): fija o limpia el `estado_override` manual de una empresa.
 *
 * `estado_override = null` limpia (vuelve al estado auto-derivado); un estado válido lo fija.
 * En ambos casos se registra un evento `cambio_estado` en el timeline (R23). Guard: staff (R29).
 * Validación Zod (`empresaOverrideSchema`). 404 si la empresa no existe.
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

  const parsed = empresaOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }

  try {
    const empresa = await setEstadoOverride(params.id, parsed.data.estado_override, user.id);
    return apiSuccess({ empresa });
  } catch (e) {
    if (e instanceof EmpresaNotFoundError) {
      return apiError(e.message, 404);
    }
    throw e;
  }
};
