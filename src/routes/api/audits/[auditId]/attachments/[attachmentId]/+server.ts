import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess, parseJsonBody } from '$lib/server/api/envelope';
import { requireStaffApi } from '$lib/server/api/guards';
import {
  AttachmentNotFoundError,
  AuditNotFoundError,
  deleteAttachment,
  deleteAttachmentSchema,
  StorageValidationError
} from '$lib/server/storage';

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
  const userOrResponse = requireStaffApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  const auditId = params.auditId;
  const attachmentId = params.attachmentId;
  if (!auditId || !attachmentId) {
    return apiError('auditId y attachmentId requeridos', 400);
  }

  const body = await parseJsonBody<unknown>(request);
  if (body instanceof Response) return body;

  const parsed = deleteAttachmentSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Datos inválidos', 400);
  }

  try {
    await deleteAttachment({
      auditId,
      attachmentId,
      itemId: parsed.data.item_id,
      rowId: parsed.data.row_id,
      userId: userOrResponse.id
    });
    return apiSuccess({ ok: true });
  } catch (err) {
    if (err instanceof AuditNotFoundError || err instanceof AttachmentNotFoundError) {
      return apiError(err.message, 404);
    }
    if (err instanceof StorageValidationError) {
      return apiError(err.message, 400);
    }
    return apiError('Error al borrar la foto', 500);
  }
};
