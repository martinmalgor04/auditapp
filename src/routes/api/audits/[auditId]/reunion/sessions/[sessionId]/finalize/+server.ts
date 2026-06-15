import type { RequestHandler } from '@sveltejs/kit';
import { apiSuccess } from '$lib/server/api/envelope';
import { requireSessionApi } from '$lib/server/api/guards';
import { getReunionSessionById, updateReunionSessionStatus } from '$lib/server/db/reunion-sessions';
import { assertReunionAccess } from '$lib/server/reunion/guards';
import {
  ReunionSessionNotFoundError,
  reunionErrorResponse
} from '$lib/server/reunion/errors';

/** POST .../finalize — marcar revisión completa → reviewed */
export const POST: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireSessionApi(locals);
  if (userOrResponse instanceof Response) return userOrResponse;
  const user = userOrResponse;

  try {
    await assertReunionAccess(params.auditId!, user);

    const session = await getReunionSessionById(params.sessionId!);
    if (!session || session.audit_id !== params.auditId) {
      throw new ReunionSessionNotFoundError();
    }

    await updateReunionSessionStatus(params.sessionId!, 'reviewed');
    return apiSuccess({ session_id: params.sessionId, status: 'reviewed' });
  } catch (err) {
    return reunionErrorResponse(err);
  }
};
