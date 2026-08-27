import type { RequestHandler } from './$types';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireSystemToken } from '$lib/server/api/require-system-token';
import { isTokenAuthRateLimited } from '$lib/server/api/escaneo-rate-limit';
import { logger } from '$lib/server/logger';
import { marcarColgadosFallidos } from '$lib/server/escaneos/jobs';

/**
 * Job de escaneos colgados (R26–R28): lo invoca un scheduler externo (cron del
 * host Dokploy) con el token de sistema de `ESCANEO_SYSTEM_TOKEN`. Fail-closed
 * si la variable no está configurada (R27).
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = requireSystemToken(request);
  if (authError) {
    const clientIp = getClientAddress();
    logger.warn('escaneo_system_auth_failed', { ip: clientIp });
    if (isTokenAuthRateLimited(clientIp)) {
      return apiError('Demasiados intentos', 429);
    }
    return authError;
  }

  try {
    const result = await marcarColgadosFallidos();
    return apiSuccess(result, 200);
  } catch (err) {
    logger.error('escaneos_colgados_error', {}, err);
    return apiError('Error interno', 500);
  }
};
