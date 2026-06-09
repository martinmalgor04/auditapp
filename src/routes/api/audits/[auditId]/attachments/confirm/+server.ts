import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireStaffApi } from '$lib/server/api/require-staff';
import {
  AttachmentConflictError,
  AuditNotFoundError,
  confirmUpload,
  confirmUploadSchema,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('JSON inválido', 400);
  }

  const parsed = confirmUploadSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Datos inválidos', 400);
  }

  try {
    const result = await confirmUpload({
      auditId,
      itemId: parsed.data.item_id,
      r2Key: parsed.data.r2_key,
      filename: parsed.data.filename,
      contentType: parsed.data.content_type,
      sizeBytes: parsed.data.size_bytes,
      kind: parsed.data.kind,
      userId: userOrResponse.id
    });

    return apiSuccess({ attachment_id: result.attachmentId });
  } catch (err) {
    if (err instanceof AuditNotFoundError) {
      return apiError(err.message, 404);
    }
    if (err instanceof AttachmentConflictError) {
      return apiError(err.message, 409);
    }
    if (err instanceof StorageValidationError) {
      return apiError(err.message, 400);
    }
    return apiError('Error al confirmar subida', 500);
  }
};
