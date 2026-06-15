import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireSessionApi } from '$lib/server/api/guards';
import { reunionConfirmSchema } from '$lib/server/reunion/schemas';
import { confirmReunionAudio } from '$lib/server/reunion/upload';
import { reunionErrorResponse } from '$lib/server/reunion/errors';

/** POST .../confirm — confirmar audio subido y encolar pipeline */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const userOrResponse = requireSessionApi(locals);
  if (userOrResponse instanceof Response) return userOrResponse;
  const user = userOrResponse;

  try {
    const body = await request.json();
    const parsed = reunionConfirmSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Datos inválidos', 400);
    }

    const result = await confirmReunionAudio(
      params.auditId!,
      params.sessionId!,
      user,
      parsed.data
    );

    return apiSuccess({ attachment_id: result.attachmentId });
  } catch (err) {
    return reunionErrorResponse(err);
  }
};
