import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
import { handleLoadError } from '$lib/server/backoffice/route-helpers';
import { empresaListFiltersSchema } from '$lib/server/crm/schemas';
import { listEmpresas, countEmpresas } from '$lib/server/db/empresa';

/**
 * #23 Fase 4 (R16, R17, R18, R29): cockpit `/crm`. Guard `requireStaff`. Filtros por relacion,
 * estado efectivo y búsqueda (razón social / CUIT), con paginación server-side para ~2000 empresas.
 * Mantiene integrado el import masivo de Fase 2 (panel en `+page.svelte`, endpoint
 * `/api/crm/clients/import` con su selector de relación — admin-only).
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  try {
    requireStaff(locals);

    const parsed = empresaListFiltersSchema.safeParse({
      relacion: url.searchParams.get('relacion') || undefined,
      estado: url.searchParams.get('estado') || undefined,
      q: url.searchParams.get('q') || undefined,
      page: url.searchParams.get('page') || undefined,
      perPage: url.searchParams.get('perPage') || undefined
    });
    const filters = parsed.success
      ? parsed.data
      : empresaListFiltersSchema.parse({});

    const result = await listEmpresas(filters);

    // Total global (sin filtros) para el contador de cabecera del cockpit.
    const totalAll = await countEmpresas(empresaListFiltersSchema.parse({}));

    return {
      user: locals.user,
      filters,
      empresas: result.rows,
      total: result.total,
      totalAll,
      page: result.page,
      perPage: result.perPage,
      totalPages: result.totalPages
    };
  } catch (e) {
    return handleLoadError(e);
  }
};
