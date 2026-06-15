import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireSessionApi } from '$lib/server/api/guards';
import {
  listReunionSessionsByAudit
} from '$lib/server/db/reunion-sessions';
import { reunionConsentSchema } from '$lib/server/reunion/schemas';
import { createReunionSession } from '$lib/server/reunion/session';
import { reunionErrorResponse } from '$lib/server/reunion/errors';
import { assertReunionAccess } from '$lib/server/reunion/guards';

/** POST /api/audits/[auditId]/reunion/sessions — crear sesión + consentimiento */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const userOrResponse = requireSessionApi(locals);
  if (userOrResponse instanceof Response) return userOrResponse;
  const user = userOrResponse;

  try {
    const body = await request.json();
    const parsed = reunionConsentSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Datos inválidos', 400);
    }

    const { sessionId } = await createReunionSession(params.auditId!, user, parsed.data);
    return apiSuccess({ session_id: sessionId }, 201);
  } catch (err) {
    return reunionErrorResponse(err);
  }
};

/** GET /api/audits/[auditId]/reunion/sessions — listar sesiones */
export const GET: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireSessionApi(locals);
  if (userOrResponse instanceof Response) return userOrResponse;
  const user = userOrResponse;

  try {
    await assertReunionAccess(params.auditId!, user);
    const sessions = await listReunionSessionsByAudit(params.auditId!);
    return apiSuccess(sessions);
  } catch (err) {
    return reunionErrorResponse(err);
  }
};
