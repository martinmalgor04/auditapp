import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
import { AuditFormNotAllowedError } from '$lib/server/form/errors';
import { loadAuditFormReadonly } from '$lib/server/form/load-form';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = requireStaff(locals);

  try {
    const form = await loadAuditFormReadonly(params.id, user);
    return { ...form, auditId: params.id };
  } catch (err) {
    if (err instanceof AuditFormNotAllowedError) {
      error(403, err.message);
    }
    throw err;
  }
};
