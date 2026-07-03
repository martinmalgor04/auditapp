import type { RequestHandler } from '@sveltejs/kit';
import { resolveShareByToken } from '$lib/server/informe/share';
import { submitSurveyResponse } from '$lib/server/informe/survey';

/**
 * POST /informe/[token]/encuesta — Responder la encuesta de conformidad (#47, R22–R23).
 * Form plano HTML sin JavaScript; redirige 303 de vuelta a /informe/[token].
 */
export const POST: RequestHandler = async ({ params, request, url }) => {
  const token = params.token!;

  // Parsear FormData
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(null, {
      status: 303,
      headers: { Location: `/informe/${token}?error=form_invalid` }
    });
  }

  // Validar que el token sea válido (sin auth requerida)
  const shareOrResponse = await resolveShareByToken(token);
  if (!shareOrResponse.ok) {
    return new Response(null, {
      status: 303,
      headers: { Location: `/informe/${token}?error=invalid_token` }
    });
  }

  const { share } = shareOrResponse;

  // Extraer campos de la encuesta
  const raw = {
    valoracion_global: formData.get('valoracion_global') as string | null,
    claridad_informe: formData.get('claridad_informe') as string | null,
    conforme_hallazgos: formData.get('conforme_hallazgos') as string | null,
    comentario: formData.get('comentario') as string | null
  };

  try {
    // Obtener IP del cliente para rate limit
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    // Procesar respuesta (validación Zod, rate limit, duplicate check)
    await submitSurveyResponse({
      token,
      raw,
      clientIp
    });

    // R23: redirect 303 a /informe/[token]
    return new Response(null, {
      status: 303,
      headers: { Location: `/informe/${token}?survey=ok` }
    });
  } catch (err) {
    console.error('[survey-submit]', err);

    // R23: si falla (validación/duplicate/rate-limit), también redirect pero con flag de error
    return new Response(null, {
      status: 303,
      headers: { Location: `/informe/${token}?survey=error` }
    });
  }
};
