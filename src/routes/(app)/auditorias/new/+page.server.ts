import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
import { allowedAuditTypesForUser } from '$lib/server/auth/audit-access';
import {
  createAudit,
  getCabItemsForTypes,
  listTechnicians,
  searchClientsForPicker
} from '$lib/server/backoffice/audits';
import { DuplicateAuditWarning } from '$lib/server/backoffice/errors';
import { parseCreateAuditFromForm } from '$lib/server/backoffice/form-parsers';
import { failFromError } from '$lib/server/backoffice/route-helpers';
import { getEmpresaCabFields } from '$lib/server/db/empresa';

export const load: PageServerLoad = async ({ locals, url }) => {
  const user = requireStaff(locals);

  const [technicians] = await Promise.all([listTechnicians()]);

  const allowedTypes = allowedAuditTypesForUser(user);
  const defaultTypes =
    allowedTypes && allowedTypes.length > 0 ? [allowedTypes[0]] : (['it'] as const);
  const cabItems = await getCabItemsForTypes([...defaultTypes]);

  // #23 Fase 5 (R21): "crear auditoría desde la ficha". Con `?empresaId=<id>` se precarga la empresa
  // seleccionada y sus datos maestros (CAB) reutilizando `cab-client-map`; la auditoría creada queda
  // vinculada a esa empresa (FK `audit.empresa_id`). Sin el parámetro, el flujo clásico es idéntico.
  const empresaId = url.searchParams.get('empresaId');
  type PreselectedEmpresa = { id: string; cabFields: NonNullable<Awaited<ReturnType<typeof getEmpresaCabFields>>> };
  let preselectedEmpresa: PreselectedEmpresa | null = null;
  if (empresaId) {
    const cabFields = await getEmpresaCabFields(empresaId);
    if (cabFields) {
      preselectedEmpresa = { id: empresaId, cabFields };
    }
  }

  return {
    technicians,
    cabItems,
    defaultTypes: [...defaultTypes],
    allowedTypes,
    preselectedEmpresa
  };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const user = requireStaff(locals);

    const formData = await request.formData();
    const input = parseCreateAuditFromForm(formData);

    try {
      const { id } = await createAudit(input, user.id, user);
      redirect(303, `/auditorias/${id}`);
    } catch (e) {
      if (e instanceof DuplicateAuditWarning) {
        return fail(409, {
          duplicateWarning: true,
          conflicts: e.conflicts,
          error: e.message
        });
      }
      return failFromError(e);
    }
  },

  searchClients: async ({ request, locals }) => {
    requireStaff(locals);
    const formData = await request.formData();
    const q = String(formData.get('q') ?? '');
    const clients = await searchClientsForPicker(q);
    return { clients };
  },

  loadCab: async ({ request, locals }) => {
    requireStaff(locals);
    const formData = await request.formData();
    const types = formData.getAll('types').map(String).filter(Boolean);

    if (types.length === 0) {
      return fail(400, { error: 'Seleccioná al menos un tipo' });
    }

    const cabItems = await getCabItemsForTypes(types);
    return { cabItems };
  }
};
