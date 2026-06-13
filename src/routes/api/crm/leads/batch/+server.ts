import type { RequestHandler } from './$types';
import { requireCrmToken } from '$lib/server/api/require-crm-token';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { crmLeadBatchSchema } from '$lib/server/crm/schemas';
import { upsertLeadsBatch } from '$lib/server/db/crm-leads';

export const POST: RequestHandler = async ({ request }) => {
  const authError = requireCrmToken(request);
  if (authError) {
    return authError;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('JSON inválido', 400);
  }

  const parsed = crmLeadBatchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }

  const result = await upsertLeadsBatch(parsed.data);
  return apiSuccess(result, 200);
};
