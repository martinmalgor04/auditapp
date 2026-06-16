import type { RequestHandler } from './$types';
import { requireStaffApi } from '$lib/server/api/require-staff';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { empresaEventoSchema } from '$lib/server/crm/schemas';
import { EmpresaNotFoundError } from '$lib/server/crm/errors';
import { addEvento, listEventos } from '$lib/server/db/empresa';

/**
 * #23 Fase 5 (R20, R22, R29): timeline de eventos de una empresa.
 *
 * - `GET`  → lista de eventos (más reciente primero) para la ficha.
 * - `POST` → registra un evento/nota manual (llamada/reunion/nota) con tipo, texto, fecha y autor.
 *
 * Guard: staff (R29). Validación Zod (`empresaEventoSchema`). 404 si la empresa no existe.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
  const user = requireStaffApi(locals);
  if (user instanceof Response) {
    return user;
  }
  const eventos = await listEventos(params.id);
  return apiSuccess({ eventos });
};

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

  const parsed = empresaEventoSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }

  try {
    const evento = await addEvento(params.id, parsed.data, user.id);
    return apiSuccess({ evento }, 201);
  } catch (e) {
    if (e instanceof EmpresaNotFoundError) {
      return apiError(e.message, 404);
    }
    throw e;
  }
};
