import type { RequestHandler } from './$types';
import { requireStaffApi } from '$lib/server/api/guards';
import { requireAdminApi } from '$lib/server/api/guards';
import { apiError, apiSuccess, parseJsonBody } from '$lib/server/api/envelope';
import {
  crmLeadCreateSchema,
  crmListFiltersSchema
} from '$lib/server/crm/schemas';
import { createLead, funnelCounts, listLeads } from '$lib/server/db/crm-leads';

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireStaffApi(locals);
  if (user instanceof Response) {
    return user;
  }

  const parsed = crmListFiltersSchema.safeParse({
    status: url.searchParams.get('status') || undefined,
    source: url.searchParams.get('source') || undefined,
    q: url.searchParams.get('q') || undefined
  });

  const filters = parsed.success ? parsed.data : {};
  const [leads, counts] = await Promise.all([listLeads(filters), funnelCounts()]);
  return apiSuccess({ leads, counts });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireAdminApi(locals);
  if (user instanceof Response) {
    return user;
  }

  const body = await parseJsonBody<unknown>(request);
  if (body instanceof Response) return body;

  const parsed = crmLeadCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }

  const lead = await createLead(parsed.data, user.id);
  return apiSuccess(lead, 201);
};
