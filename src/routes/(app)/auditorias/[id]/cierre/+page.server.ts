import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
import { failFromError } from '$lib/server/backoffice/route-helpers';
import { loadClosurePage } from '$lib/server/closure/load-closure';
import { parseClosureFieldsFromFormData } from '$lib/server/scoring/schemas';
import {
  confirmClosure,
  reopenAudit,
  saveClosureFields
} from '$lib/server/scoring/persist';
import { ClosureValidationError } from '$lib/server/scoring/errors';
import { BackofficeError } from '$lib/server/backoffice/errors';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = requireStaff(locals);

  try {
    return await loadClosurePage(params.id, user);
  } catch (e) {
    if (e instanceof BackofficeError) {
      error(e.status, e.message);
    }
    throw e;
  }
};

export const actions: Actions = {
  saveClosure: async ({ request, locals, params }) => {
    const user = requireStaff(locals);

    try {
      const formData = await request.formData();
      const fields = parseClosureFieldsFromFormData(formData);
      await saveClosureFields(params.id, fields, user);
      return { success: true };
    } catch (e) {
      if (e instanceof ClosureValidationError) {
        return fail(400, { error: e.message, code: e.code, fields: e.fields });
      }
      return failFromError(e);
    }
  },

  confirmClosure: async ({ locals, params }) => {
    const user = requireStaff(locals);

    try {
      await confirmClosure(params.id, user);
      redirect(303, `/auditorias/${params.id}`);
    } catch (e) {
      if (isRedirect(e)) throw e;
      return failFromError(e);
    }
  },

  reopenAudit: async ({ locals, params }) => {
    const user = requireStaff(locals);

    try {
      await reopenAudit(params.id, user);
      redirect(303, `/auditorias/${params.id}/cierre`);
    } catch (e) {
      if (isRedirect(e)) throw e;
      return failFromError(e);
    }
  }
};
