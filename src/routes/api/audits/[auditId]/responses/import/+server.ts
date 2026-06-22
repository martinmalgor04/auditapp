import type { RequestHandler } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { apiError, apiSuccess, parseJsonBody } from '$lib/server/api/envelope';
import { requireStaffApi } from '$lib/server/api/guards';
import {
  AuditFormNotAllowedError,
  AuditFormNotEditableError,
  FormImportValidationError
} from '$lib/server/form/errors';
import { importFormBackup } from '$lib/server/form/export-import';

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

  try {
    const result = await importFormBackup(auditId, userOrResponse, body);
    return apiSuccess(result);
  } catch (err) {
    if (err instanceof FormImportValidationError) {
      return apiError(err.message, 400);
    }
    if (err instanceof AuditFormNotAllowedError) {
      return apiError(err.message, 403);
    }
    if (err instanceof AuditFormNotEditableError) {
      return apiError(err.message, 409);
    }
    if (err instanceof ZodError) {
      return apiError(err.issues[0]?.message ?? 'JSON inválido', 400);
    }
    return apiError('Error al importar', 500);
  }
};
