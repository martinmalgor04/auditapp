import { apiError } from './envelope';
import { bearerTokenHash, requireEscaneoToken, type AmbitoTokenEscaneo } from './require-escaneo-token';
import { isAgenteRateLimited, isIngestaRateLimited } from './escaneo-rate-limit';
import { registrarAgente } from '$lib/server/escaneos/api';
import { esMajorAgenteCompatible, extraerVersionAgente } from '$lib/server/escaneos/http';

/**
 * Preludio común de los endpoints del agente (#60):
 * 1. Rate limit por token (R23 ingesta / R24 resto) ANTES de tocar la DB.
 * 2. Guard Bearer: 401 genérico, 404 en mismatch path↔token (R7, R8, R9).
 * 3. `X-Agente-Version` obligatorio y semver (R19); major incompatible → 409 (R20).
 * 4. Persiste versión/hostname del agente cuando difieren (R21).
 */
export async function requireAgenteRequest(
  request: Request,
  escaneoIdPath: string,
  clientIp: string,
  opts: { ingesta?: boolean } = {}
): Promise<AmbitoTokenEscaneo | Response> {
  const tokenHash = bearerTokenHash(request);
  if (tokenHash) {
    const limited = opts.ingesta
      ? isIngestaRateLimited(tokenHash)
      : isAgenteRateLimited(tokenHash);
    if (limited) {
      return apiError('Demasiados requests', 429);
    }
  }

  const ambito = await requireEscaneoToken(request, escaneoIdPath, clientIp);
  if (ambito instanceof Response) {
    return ambito;
  }

  const agente = extraerVersionAgente(request);
  if (agente instanceof Response) {
    return agente;
  }
  if (!esMajorAgenteCompatible(agente.version)) {
    return apiError('Versión del agente incompatible: actualice el agente', 409);
  }

  await registrarAgente(ambito.empresaId, ambito.escaneoId, agente.version, agente.hostname);

  return ambito;
}
