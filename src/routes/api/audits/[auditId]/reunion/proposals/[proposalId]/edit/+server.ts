import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireSessionApi } from '$lib/server/api/guards';
import { editAndAcceptProposal } from '$lib/server/reunion/review';
import { reunionEditProposalSchema } from '$lib/server/reunion/schemas';
import { reunionErrorResponse } from '$lib/server/reunion/errors';
import { assertReunionAccess } from '$lib/server/reunion/guards';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const userOrResponse = requireSessionApi(locals);
  if (userOrResponse instanceof Response) return userOrResponse;
  const user = userOrResponse;

  try {
    await assertReunionAccess(params.auditId!, user);

    const body = await request.json();
    const parsed = reunionEditProposalSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Datos inválidos', 400);
    }

    await editAndAcceptProposal(
      params.proposalId!,
      params.auditId!,
      parsed.data.final_value,
      user.id
    );

    return apiSuccess({ proposal_id: params.proposalId, review_status: 'edited' });
  } catch (err) {
    return reunionErrorResponse(err);
  }
};
