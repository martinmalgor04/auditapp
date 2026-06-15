import type { RequestHandler } from '@sveltejs/kit';
import { apiSuccess } from '$lib/server/api/envelope';
import { requireSessionApi } from '$lib/server/api/guards';
import { getReunionSessionById } from '$lib/server/db/reunion-sessions';
import { getReunionTranscriptBySession } from '$lib/server/db/reunion-transcripts';
import { listReunionProposalsBySession } from '$lib/server/db/reunion-proposals';
import { assertReunionAccess } from '$lib/server/reunion/guards';
import {
  ReunionSessionNotFoundError,
  reunionErrorResponse
} from '$lib/server/reunion/errors';

/** GET /api/audits/[auditId]/reunion/sessions/[sessionId] — detalle completo */
export const GET: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireSessionApi(locals);
  if (userOrResponse instanceof Response) return userOrResponse;
  const user = userOrResponse;

  try {
    await assertReunionAccess(params.auditId!, user);

    const session = await getReunionSessionById(params.sessionId!);
    if (!session || session.audit_id !== params.auditId) {
      throw new ReunionSessionNotFoundError();
    }

    const [transcript, proposals] = await Promise.all([
      getReunionTranscriptBySession(session.id),
      listReunionProposalsBySession(session.id)
    ]);

    return apiSuccess({ session, transcript, proposals });
  } catch (err) {
    return reunionErrorResponse(err);
  }
};
