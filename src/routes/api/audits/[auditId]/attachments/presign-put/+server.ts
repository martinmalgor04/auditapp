import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess, parseJsonBody } from '$lib/server/api/envelope';
import { requireStaffApi } from '$lib/server/api/guards';
import {
  AuditNotFoundError,
  presignPutRequestSchema,
  requestPresignedUpload,
  StorageValidationError
} from '$lib/server/storage';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const userOrResponse = requireStaffApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  const auditId = params.auditId;
  if (!auditId) {
    return apiError('auditId requerido', 400);
  }

  const body = await parseJsonBody<unknown>(request);
  if (body instanceof Response) return body;

  const parsed = presignPutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Datos inválidos', 400);
  }

  try {
    const result = await requestPresignedUpload({
      auditId,
      itemId: parsed.data.item_id,
      sectionCode: parsed.data.section_code,
      filename: parsed.data.filename,
      contentType: parsed.data.content_type,
      sizeBytes: parsed.data.size_bytes,
      kind: parsed.data.kind,
      userId: userOrResponse.id
    });

    return apiSuccess({
      upload_url: result.uploadUrl,
      r2_key: result.r2Key,
      expires_at: result.expiresAt.toISOString(),
      headers: result.headers
    });
  } catch (err) {
    if (err instanceof AuditNotFoundError) {
      return apiError(err.message, 404);
    }
    if (err instanceof StorageValidationError) {
      return apiError(err.message, 400);
    }
    return apiError('Error al generar URL de subida', 500);
  }
};
