import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
import { listClientsForFilter, listDashboardAudits } from '$lib/server/backoffice/dashboard';
import { dashboardFiltersSchema } from '$lib/server/backoffice/schemas';
import { getBriefingUrl } from '$lib/server/backoffice/briefing-link';
import { failFromError } from '$lib/server/backoffice/route-helpers';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireStaff(locals);

  const parsed = dashboardFiltersSchema.safeParse({
    type: url.searchParams.get('type') || undefined,
    status: url.searchParams.get('status') || undefined,
    clientId: url.searchParams.get('clientId') || undefined,
    q: url.searchParams.get('q') || undefined,
    sort: url.searchParams.get('sort') || undefined,
    page: url.searchParams.get('page') || undefined
  });

  const filters = parsed.success ? parsed.data : dashboardFiltersSchema.parse({});
  const [dashboard, clients] = await Promise.all([
    listDashboardAudits(filters),
    listClientsForFilter()
  ]);

  return {
    dashboard,
    clients,
    filters
  };
};

export const actions: Actions = {
  copyBriefingLink: async ({ request, locals }) => {
    requireStaff(locals);
    const formData = await request.formData();
    const publicToken = String(formData.get('publicToken') ?? '');

    if (!publicToken) {
      return fail(400, { error: 'Token no disponible' });
    }

    return { success: true, url: getBriefingUrl(publicToken) };
  }
};
