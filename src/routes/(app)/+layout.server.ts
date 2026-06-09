import type { LayoutServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';

export const load: LayoutServerLoad = async ({ locals }) => {
  requireStaff(locals);
  return { user: locals.user };
};
