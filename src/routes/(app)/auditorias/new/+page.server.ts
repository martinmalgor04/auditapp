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
import { parseCreateAuditFromForm } from '$lib/server/backoffice/form-parsers';
import { failFromError } from '$lib/server/backoffice/route-helpers';

export const load: PageServerLoad = async ({ locals }) => {
  const user = requireStaff(locals);

  const [technicians] = await Promise.all([listTechnicians()]);

  const allowedTypes = allowedAuditTypesForUser(user);
  const defaultTypes =
    allowedTypes && allowedTypes.length > 0 ? [allowedTypes[0]] : (['it'] as const);
  const cabItems = await getCabItemsForTypes([...defaultTypes]);

  return { technicians, cabItems, defaultTypes: [...defaultTypes], allowedTypes };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const user = requireStaff(locals);

    try {
      const formData = await request.formData();
      const input = parseCreateAuditFromForm(formData);
      const { id } = await createAudit(input, user.id, user);
      redirect(303, `/auditorias/${id}`);
    } catch (e) {
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
