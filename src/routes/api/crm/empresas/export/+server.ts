import type { RequestHandler } from './$types';
import { requireStaffApi } from '$lib/server/api/guards';
import { apiError } from '$lib/server/api/envelope';
import { empresaListFiltersSchema } from '$lib/server/crm/schemas';
import { listEmpresasForExport } from '$lib/server/db/empresa';
import { empresasToCsv } from '$lib/server/crm/empresa-csv';

/**
 * #23 Fase 5 (R26, R29): exporta el listado **filtrado** de empresas como CSV.
 *
 * Aplica exactamente los filtros activos del cockpit (relacion, estado efectivo, búsqueda) tomados
 * del query string; ignora la paginación (exporta todas las filas que cumplen el filtro). Guard:
 * staff (R29). El CSV lleva BOM UTF-8 para que Excel respete los acentos.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireStaffApi(locals);
  if (user instanceof Response) {
    return user;
  }

  const parsed = empresaListFiltersSchema.safeParse({
    relacion: url.searchParams.get('relacion') || undefined,
    estado: url.searchParams.get('estado') || undefined,
    q: url.searchParams.get('q') || undefined
  });
  if (!parsed.success) {
    return apiError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }

  const rows = await listEmpresasForExport(parsed.data);
  const csv = `﻿${empresasToCsv(rows)}`;
  const today = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="empresas-${today}.csv"`
    }
  });
};
