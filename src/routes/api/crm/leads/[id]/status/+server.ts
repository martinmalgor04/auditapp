import type { RequestHandler } from './$types';
import { requireStaffApi } from '$lib/server/api/require-staff';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { crmStatusChangeSchema } from '$lib/server/crm/schemas';
import { CrmInvalidTransitionError, CrmLeadNotFoundError } from '$lib/server/crm/errors';
import { changeStatus, getLeadById } from '$lib/server/db/crm-leads';

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const user = requireStaffApi(locals);
  if (user instanceof Response) {
    return user;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('JSON inválido', 400);
  }

  const parsed = crmStatusChangeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }

  const existing = await getLeadById(params.id);
  if (!existing) {
    return apiError('Lead no encontrado', 404);
  }

  try {
    const lead = await changeStatus(params.id, parsed.data.to, user.id);
    return apiSuccess(lead);
  } catch (e) {
    if (e instanceof CrmInvalidTransitionError) {
      return apiError(e.message, 409);
    }
    if (e instanceof CrmLeadNotFoundError) {
      return apiError(e.message, 404);
    }
    throw e;
  }
};
