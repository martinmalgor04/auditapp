import type { PageServerLoad } from './$types';
import { requireAdminPage } from '$lib/server/backoffice/route-helpers';
import { buildMercadoDashboard } from '$lib/server/mercado/aggregate';
import { MercadoInvalidFilterError } from '$lib/server/mercado/errors';
import { parseMercadoFilters } from '$lib/server/mercado/filters';
import { listMercadoRubros } from '$lib/server/mercado/queries';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdminPage(locals);

  try {
    const filters = parseMercadoFilters(url);
    const [dashboard, rubros] = await Promise.all([
      buildMercadoDashboard(filters),
      listMercadoRubros()
    ]);
    return {
      user: locals.user,
      dashboard,
      filters,
      rubros
    };
  } catch (e) {
    if (e instanceof MercadoInvalidFilterError) {
      error(400, e.message);
    }
    throw e;
  }
};
