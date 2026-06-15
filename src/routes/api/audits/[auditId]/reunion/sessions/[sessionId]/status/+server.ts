import type { RequestHandler } from '@sveltejs/kit';
import { apiSuccess } from '$lib/server/api/envelope';
import { requireSessionApi } from '$lib/server/api/guards';
import { getReunionSessionById } from '$lib/server/db/reunion-sessions';
import { getReunionTranscriptBySession } from '$lib/server/db/reunion-transcripts';
import { assertReunionAccess } from '$lib/server/reunion/guards';
import {
  ReunionSessionNotFoundError,
  reunionErrorResponse
} from '$lib/server/reunion/errors';

type AggregatedStatus = 'uploading' | 'processing' | 'ready_for_review' | 'reviewed' | 'error';

function toAggregatedStatus(
  sessionStatus: string,
  transcriptStatus?: string | null
): AggregatedStatus {
  if (sessionStatus === 'ready_for_review') return 'ready_for_review';
  if (sessionStatus === 'reviewed') return 'reviewed';
  if (sessionStatus === 'error') return 'error';
  if (sessionStatus === 'uploading') return 'uploading';
  if (sessionStatus === 'processing') {
    if (transcriptStatus === 'error') return 'error';
    return 'processing';
  }
  return 'processing';
}

/** GET .../status — estado agregado para polling */
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

    const transcript = await getReunionTranscriptBySession(session.id);
    const aggregated = toAggregatedStatus(session.status, transcript?.status);

    return apiSuccess({
      session_id: session.id,
      status: aggregated,
      session_status: session.status,
      transcript_status: transcript?.status ?? null,
      error_message: session.error_message ?? transcript?.error_message ?? null
    });
  } catch (err) {
    return reunionErrorResponse(err);
  }
};
