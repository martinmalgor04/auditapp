import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
import { handleLoadError } from '$lib/server/backoffice/route-helpers';
import { getEmpresaById, listEventos } from '$lib/server/db/empresa';

/**
 * #23 Fase 4/5 (R19, R20, R22, R23): ficha de empresa. Guard `requireStaff`. Carga datos maestros +
 * estado efectivo (auto-derivado u override) + el **timeline** de eventos/notas (Fase 5). Permite
 * editar datos maestros + `relacion`, registrar eventos, setear/limpiar override y crear auditoría.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
  try {
    requireStaff(locals);
    const empresa = await getEmpresaById(params.id);
    if (!empresa) {
      error(404, 'Empresa no encontrada');
    }
    const eventos = await listEventos(params.id);
    return {
      user: locals.user,
      empresa,
      eventos
    };
  } catch (e) {
    return handleLoadError(e);
  }
};
