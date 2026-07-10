import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireStaffApi } from '$lib/server/api/guards';
import {
  AttachmentNotFoundError,
  StorageForbiddenError,
  requestPresignedDownload
} from '$lib/server/storage';

export const GET: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireStaffApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  const attachmentId = params.attachmentId;
  if (!attachmentId) {
    return apiError('attachmentId requerido', 400);
  }

  try {
    const result = await requestPresignedDownload({
      attachmentId,
      userId: userOrResponse.id,
      user: userOrResponse
    });

    return apiSuccess({
      download_url: result.downloadUrl,
      expires_at: result.expiresAt.toISOString()
    });
  } catch (err) {
    if (err instanceof AttachmentNotFoundError) {
      return apiError(err.message, 404);
    }
    if (err instanceof StorageForbiddenError) {
      return apiError(err.message, 403);
    }
    return apiError('Error al generar URL de descarga', 500);
  }
};
