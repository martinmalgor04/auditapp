import type { PageServerLoad } from './$types';
import { requireAdminPage } from '$lib/server/backoffice/route-helpers';
import { buildMercadoDashboard } from '$lib/server/mercado/aggregate';
import { normalizeProvincia } from '$lib/server/mercado/classify';
import { MercadoInvalidFilterError } from '$lib/server/mercado/errors';
import { parseMercadoFilters } from '$lib/server/mercado/filters';
import { listMercadoProvincias, listMercadoRubros } from '$lib/server/mercado/queries';
import { error } from '@sveltejs/kit';

/** Provincias normalizadas y deduplicadas (NEA primero) para el `<select>` del filtro. */
function buildProvinciaOptions(
  rows: Array<{ provincia: string }>
): Array<{ key: string; is_nea: boolean }> {
  const byKey = new Map<string, boolean>();
  for (const row of rows) {
    const { key, is_nea } = normalizeProvincia(row.provincia);
    if (key === 'Sin dato') continue;
    byKey.set(key, is_nea);
  }
  return [...byKey.entries()]
    .map(([key, is_nea]) => ({ key, is_nea }))
    .sort((a, b) => Number(b.is_nea) - Number(a.is_nea) || a.key.localeCompare(b.key));
}

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdminPage(locals);

  try {
    const filters = parseMercadoFilters(url);
    const [dashboard, rubros, provinciaRows] = await Promise.all([
      buildMercadoDashboard(filters),
      listMercadoRubros(),
      listMercadoProvincias()
    ]);
    return {
      user: locals.user,
      dashboard,
      filters,
      rubros,
      provincias: buildProvinciaOptions(provinciaRows)
    };
  } catch (e) {
    if (e instanceof MercadoInvalidFilterError) {
      error(400, e.message);
    }
    throw e;
  }
};
