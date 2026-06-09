import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
import {
  createAudit,
  getCabItemsForTypes,
  listClientsForPicker,
  listTechnicians
} from '$lib/server/backoffice/audits';
import { parseCreateAuditFromForm } from '$lib/server/backoffice/form-parsers';
import { failFromError } from '$lib/server/backoffice/route-helpers';

export const load: PageServerLoad = async ({ locals }) => {
  requireStaff(locals);

  const [clients, technicians] = await Promise.all([
    listClientsForPicker(),
    listTechnicians()
  ]);

  const defaultTypes = ['it'];
  const cabItems = await getCabItemsForTypes(defaultTypes);

  return { clients, technicians, cabItems, defaultTypes };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const user = requireStaff(locals);

    try {
      const formData = await request.formData();
      const input = parseCreateAuditFromForm(formData);
      const { id } = await createAudit(input, user.id);
      redirect(303, `/auditorias/${id}`);
    } catch (e) {
      return failFromError(e);
    }
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
