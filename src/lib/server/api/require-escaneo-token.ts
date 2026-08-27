import { apiError } from './envelope';
import { logger } from '$lib/server/logger';
import { hashToken } from '$lib/server/auth/password-reset';
import { resolverTokenEscaneo } from '$lib/server/escaneos/api';
import { isTokenAuthRateLimited } from './escaneo-rate-limit';

export type AmbitoTokenEscaneo = {
  escaneoId: string;
  empresaId: string;
};

type MotivoFalloAuth = 'sin_token' | 'not_found' | 'revoked' | 'expired';

/** Hash SHA-256 del Bearer del request (clave de rate limit); null si no hay. */
export function bearerTokenHash(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token ? hashToken(token) : null;
}

/**
 * Guard de los endpoints del agente (#60):
 * 1. Sin `Authorization: Bearer` → 401 genérico (R7).
 * 2. Token inexistente, revocado o expirado → 401 con el mismo mensaje (R7) +
 *    log categorizado sin material del token (R30) + conteo por IP (R25).
 * 3. `escaneoId` del path ≠ escaneo del token → 404 idéntico a inexistente (R9).
 * 4. OK → `(escaneoId, empresaId)` resueltos del token (R8): el repo de #59
 *    siempre recibe el `empresaId` del token, nunca del cliente.
 */
export async function requireEscaneoToken(
  request: Request,
  escaneoIdPath: string,
  clientIp: string
): Promise<AmbitoTokenEscaneo | Response> {
  const header = request.headers.get('Authorization');
  const tokenClaro = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';

  if (!tokenClaro) {
    return falloAuth(clientIp, 'sin_token');
  }

  const resolucion = await resolverTokenEscaneo(tokenClaro);
  if (!resolucion.ok) {
    return falloAuth(clientIp, resolucion.reason);
  }

  if (resolucion.escaneoId !== escaneoIdPath) {
    return apiError('Escaneo no encontrado', 404);
  }

  return { escaneoId: resolucion.escaneoId, empresaId: resolucion.empresaId };
}

function falloAuth(clientIp: string, motivo: MotivoFalloAuth): Response {
  logger.warn('escaneo_token_auth_failed', { ip: clientIp, motivo });
  if (isTokenAuthRateLimited(clientIp)) {
    return apiError('Demasiados intentos', 429);
  }
  return apiError('No autorizado', 401);
}
