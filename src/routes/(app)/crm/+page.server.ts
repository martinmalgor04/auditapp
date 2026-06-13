import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
import { handleLoadError } from '$lib/server/backoffice/route-helpers';
import { crmListFiltersSchema } from '$lib/server/crm/schemas';
import { funnelCounts, listLeads, listLeadEvents } from '$lib/server/db/crm-leads';

export const load: PageServerLoad = async ({ locals, url }) => {
  try {
    requireStaff(locals);
    const parsed = crmListFiltersSchema.safeParse({
      status: url.searchParams.get('status') || undefined,
      source: url.searchParams.get('source') || undefined,
      q: url.searchParams.get('q') || undefined
    });
    const filters = parsed.success ? parsed.data : {};
    const [leads, counts] = await Promise.all([listLeads(filters), funnelCounts()]);
    const eventsByLead: Record<string, Awaited<ReturnType<typeof listLeadEvents>>> = {};
    for (const lead of leads.slice(0, 50)) {
      eventsByLead[lead.id] = await listLeadEvents(lead.id);
    }
    return {
      user: locals.user,
      leads,
      counts,
      filters,
      eventsByLead
    };
  } catch (e) {
    return handleLoadError(e);
  }
};
