import type { LayoutServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
import { handleLoadError } from '$lib/server/backoffice/route-helpers';

export const load: LayoutServerLoad = async ({ locals }) => {
  try {
    requireStaff(locals);
    return { user: locals.user };
  } catch (e) {
    return handleLoadError(e);
  }
};
