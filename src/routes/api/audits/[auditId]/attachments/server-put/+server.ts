import type { RequestHandler } from '@sveltejs/kit';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireStaffApi } from '$lib/server/api/require-staff';
import {
  AuditNotFoundError,
  MAX_UPLOAD_BYTES,
  StorageValidationError,
  uploadObjectToR2
} from '$lib/server/storage';

/**
 * PUT del binario vía servidor (evita CORS del bucket R2 en el navegador).
 * Flujo: presign-put → server-put (este endpoint) → confirm.
 */
export const POST: RequestHandler = async ({ params, request, locals, url }) => {
  const userOrResponse = requireStaffApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  const auditId = params.auditId;
  if (!auditId) {
    return apiError('auditId requerido', 400);
  }

  const r2Key = url.searchParams.get('r2_key')?.trim();
  if (!r2Key) {
    return apiError('r2_key requerido', 400);
  }

  let body: ArrayBuffer;
  try {
    body = await request.arrayBuffer();
  } catch {
    return apiError('Cuerpo de la foto inválido', 400);
  }

  if (body.byteLength === 0) {
    return apiError('La foto está vacía', 400);
  }
  if (body.byteLength > MAX_UPLOAD_BYTES) {
    return apiError('Archivo demasiado grande', 413);
  }

  const contentType = request.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream';

  try {
    await uploadObjectToR2({ auditId, r2Key, contentType, body });
    return apiSuccess({ ok: true });
  } catch (err) {
    if (err instanceof AuditNotFoundError) {
      return apiError(err.message, 404);
    }
    if (err instanceof StorageValidationError) {
      return apiError(err.message, 400);
    }
    return apiError('Error al subir la foto a storage', 500);
  }
};
