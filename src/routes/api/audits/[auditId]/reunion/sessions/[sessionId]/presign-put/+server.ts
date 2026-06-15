import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireSessionApi } from '$lib/server/api/guards';
import { reunionAudioPresignSchema } from '$lib/server/reunion/schemas';
import { requestReunionAudioUpload } from '$lib/server/reunion/upload';
import { reunionErrorResponse } from '$lib/server/reunion/errors';

/** POST .../presign-put — solicitar URL firmada para subir audio */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  const userOrResponse = requireSessionApi(locals);
  if (userOrResponse instanceof Response) return userOrResponse;
  const user = userOrResponse;

  try {
    const body = await request.json();
    const parsed = reunionAudioPresignSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? 'Datos inválidos', 400);
    }

    const result = await requestReunionAudioUpload(
      params.auditId!,
      params.sessionId!,
      user,
      parsed.data
    );

    return apiSuccess({
      upload_url: result.uploadUrl,
      r2_key: result.r2Key,
      expires_at: result.expiresAt,
      headers: result.headers
    });
  } catch (err) {
    return reunionErrorResponse(err);
  }
};
