import type { PageServerLoad } from './$types';
import { listActiveTemplates } from '$lib/server/backoffice/templates';
import { requireAdminPage } from '$lib/server/backoffice/route-helpers';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdminPage(locals);
  const templates = await listActiveTemplates();
  return { templates };
};
