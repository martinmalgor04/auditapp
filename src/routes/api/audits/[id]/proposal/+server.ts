import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireAdminApi } from '$lib/server/api/guards';
import { psysErrorResponse } from '$lib/server/psys/access';
import { createAuditProposal, syncAuditProposal } from '$lib/server/psys/proposal';

/** POST: crear presupuesto en presupuestossys desde informe aprobado (R1–R9, R16). */
export const POST: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireAdminApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  try {
    const result = await createAuditProposal({
      auditId: params.id!,
      userId: userOrResponse.id
    });
    return apiSuccess(result.link, result.created ? 201 : 200);
  } catch (err) {
    return psysErrorResponse(err);
  }
};

/** GET: sincronizar estado del presupuesto vinculado (R10–R12). */
export const GET: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireAdminApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  try {
    const data = await syncAuditProposal({ auditId: params.id! });
    return apiSuccess(data);
  } catch (err) {
    return psysErrorResponse(err);
  }
};
