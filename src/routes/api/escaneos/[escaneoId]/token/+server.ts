import type { RequestHandler } from './$types';
import type { AppUser } from '$lib/server/auth/types';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireStaffApi } from '$lib/server/api/guards';
import { techIsAssigned } from '$lib/server/db/audit-assignment';
import {
  emitirTokenEscaneo,
  resolverAmbitoEscaneo,
  revocarTokenEscaneo,
  type AmbitoEscaneo
} from '$lib/server/escaneos/api';

/**
 * Guard staff compartido (R6): sesión staff + escaneo existente (404) +
 * admin o técnico asignado a la auditoría dueña (403 sin mutar nada).
 */
async function requireStaffEscaneo(
  locals: App.Locals,
  escaneoId: string
): Promise<{ user: AppUser; ambito: AmbitoEscaneo } | Response> {
  const user = requireStaffApi(locals);
  if (user instanceof Response) {
    return user;
  }

  const ambito = await resolverAmbitoEscaneo(escaneoId);
  if (!ambito) {
    return apiError('Escaneo no encontrado', 404);
  }

  if (user.role !== 'admin' && !(await techIsAssigned(ambito.auditId, user.id))) {
    return apiError('No tenés permiso para esta acción', 403);
  }

  return { user, ambito };
}

/**
 * Emite token de escaneo (R1, R3, R5). El claro se devuelve SOLO en esta
 * respuesta; en DB queda el hash SHA-256 y el token previo queda revocado.
 */
export const POST: RequestHandler = async ({ params, locals }) => {
  const auth = await requireStaffEscaneo(locals, params.escaneoId);
  if (auth instanceof Response) {
    return auth;
  }

  const { token, expiresAt } = await emitirTokenEscaneo(auth.ambito.escaneoId, auth.user.id);
  return apiSuccess({ token, expiresAt }, 200);
};

/** Revoca el token activo (R4). Idempotente: 200 siempre que exista el escaneo. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const auth = await requireStaffEscaneo(locals, params.escaneoId);
  if (auth instanceof Response) {
    return auth;
  }

  await revocarTokenEscaneo(auth.ambito.escaneoId);
  return apiSuccess({ revocado: true }, 200);
};
