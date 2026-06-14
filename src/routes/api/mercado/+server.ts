import type { RequestHandler } from './$types';
import { requireAdminApi } from '$lib/server/api/guards';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { buildMercadoDashboard } from '$lib/server/mercado/aggregate';
import { MercadoInvalidFilterError } from '$lib/server/mercado/errors';
import { parseMercadoFilters } from '$lib/server/mercado/filters';

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireAdminApi(locals);
  if (user instanceof Response) {
    return user;
  }

  try {
    const filters = parseMercadoFilters(url);
    const dashboard = await buildMercadoDashboard(filters);
    return apiSuccess(dashboard);
  } catch (e) {
    if (e instanceof MercadoInvalidFilterError) {
      return apiError(e.message, 400);
    }
    throw e;
  }
};
