import { json, type RequestHandler } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { BriefingItemNotAllowedError, BriefingUnavailableError } from '$lib/server/briefing/errors';
import { isBriefingRateLimited } from '$lib/server/briefing/rate-limit';
import { briefingSaveSchema } from '$lib/server/briefing/schemas';
import { saveBriefingResponse } from '$lib/server/briefing/save-response';

export const PATCH: RequestHandler = async ({ params, request, getClientAddress }) => {
  const token = params.token;
  if (!token) {
    return json({ success: false, data: null, error: 'Token requerido' }, { status: 400 });
  }

  if (isBriefingRateLimited(getClientAddress(), token)) {
    return json(
      { success: false, data: null, error: 'Demasiados intentos, esperá un momento' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, data: null, error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = briefingSaveSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { success: false, data: null, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 }
    );
  }

  try {
    const result = await saveBriefingResponse(token, parsed.data.itemId, {
      value: parsed.data.value,
      na: parsed.data.na
    });
    return json({ success: true, data: result, error: null });
  } catch (err) {
    if (err instanceof BriefingItemNotAllowedError) {
      return json({ success: false, data: null, error: err.message }, { status: 403 });
    }
    if (err instanceof BriefingUnavailableError) {
      return json({ success: false, data: null, error: err.message }, { status: 403 });
    }
    if (err instanceof ZodError) {
      return json(
        { success: false, data: null, error: err.issues[0]?.message ?? 'Valor inválido' },
        { status: 400 }
      );
    }
    return json({ success: false, data: null, error: 'Error al guardar' }, { status: 500 });
  }
};
