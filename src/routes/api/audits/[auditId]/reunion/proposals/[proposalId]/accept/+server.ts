import type { RequestHandler } from '@sveltejs/kit';
import { apiSuccess } from '$lib/server/api/envelope';
import { requireSessionApi } from '$lib/server/api/guards';
import { acceptProposal } from '$lib/server/reunion/review';
import { reunionErrorResponse } from '$lib/server/reunion/errors';
import { assertReunionAccess } from '$lib/server/reunion/guards';

export const POST: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireSessionApi(locals);
  if (userOrResponse instanceof Response) return userOrResponse;
  const user = userOrResponse;

  try {
    await assertReunionAccess(params.auditId!, user);
    await acceptProposal(params.proposalId!, params.auditId!, user.id);
    return apiSuccess({ proposal_id: params.proposalId, review_status: 'accepted' });
  } catch (err) {
    return reunionErrorResponse(err);
  }
};
