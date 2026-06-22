import type { RequestHandler } from './$types';
import { requireCrmToken } from '$lib/server/api/require-crm-token';
import { apiError, apiSuccess, parseJsonBody } from '$lib/server/api/envelope';
import { crmLeadBatchSchema } from '$lib/server/crm/schemas';
import { upsertLeadsBatch } from '$lib/server/db/crm-leads';

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireCrmToken(request);
  if (authError) {
    return authError;
  }

  const body = await parseJsonBody<unknown>(request);
  if (body instanceof Response) return body;

  const parsed = crmLeadBatchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }

  const result = await upsertLeadsBatch(parsed.data);
  return apiSuccess(result, 200);
};
