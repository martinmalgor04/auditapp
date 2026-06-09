import { json, type RequestHandler } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireStaffApi } from '$lib/server/api/require-staff';
import {
  AuditFormNotAllowedError,
  AuditFormNotEditableError,
  FormItemNotAllowedError
} from '$lib/server/form/errors';
import { formSaveSchema } from '$lib/server/form/schemas';
import { saveFormResponse } from '$lib/server/form/save-response';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
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

  const parsed = formSaveSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Datos inválidos', 400);
  }

  try {
    const result = await saveFormResponse(auditId, userOrResponse, {
      itemId: parsed.data.itemId,
      value: parsed.data.value,
      na: parsed.data.na,
      notes: parsed.data.notes
    });

    return apiSuccess({
      updatedAt: result.updatedAt,
      sectionScore: result.sectionScore
        ? {
            score: result.sectionScore.score,
            band: result.sectionScore.band,
            sectionId: result.sectionScore.sectionId
          }
        : undefined
    });
  } catch (err) {
    if (err instanceof AuditFormNotAllowedError) {
      return apiError(err.message, 403);
    }
    if (err instanceof AuditFormNotEditableError) {
      return apiError(err.message, 409);
    }
    if (err instanceof FormItemNotAllowedError) {
      return apiError(err.message, 403);
    }
    if (err instanceof ZodError) {
      return apiError(err.issues[0]?.message ?? 'Valor inválido', 400);
    }
    return apiError('Error al guardar', 500);
  }
};
