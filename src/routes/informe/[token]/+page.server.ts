import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { registerShareView } from '$lib/server/db/informe-shares';
import { getAuditForReport } from '$lib/server/informe/access';
import { buildInformeRenderModel } from '$lib/server/informe/model';
import { isInformeShareRateLimited } from '$lib/server/informe/rate-limit';
import {
  INFORME_SHARE_UNAVAILABLE_MESSAGE,
  resolveShareByToken
} from '$lib/server/informe/share';
import {
  getSurveyByShareId,
  submitSurveyResponse,
  toSurveyState,
  type SurveyState
} from '$lib/server/informe/survey';

export const load: PageServerLoad = async ({ params, setHeaders, getClientAddress }) => {
  if (isInformeShareRateLimited(getClientAddress())) {
    error(429, 'Demasiados intentos. Probá de nuevo en unos minutos.');
  }

  const resolution = await resolveShareByToken(params.token);
  if (!resolution.ok) {
    // Causa indistinguible hacia afuera (R2); el log server-side ya la registró.
    error(404, INFORME_SHARE_UNAVAILABLE_MESSAGE);
  }

  await registerShareView(resolution.share.id);
  setHeaders({ 'X-Robots-Tag': 'noindex, nofollow' });

  const audit = await getAuditForReport(resolution.report.auditId);

  // Estado de encuesta: solo campos públicos, nunca share_id/report_id/ids (R1, R2).
  const survey = await getSurveyByShareId(resolution.share.id);
  const encuesta: SurveyState = toSurveyState(survey);

  return {
    model: buildInformeRenderModel(resolution.report, {
      refCode: audit?.refCode
    }),
    token: params.token,
    encuesta
  };
};

export const actions: Actions = {
  /**
   * Envío de la encuesta de conformidad por token público, sin auth.
   * Reusa el guard de #15: rate limit (R10) → resolveShareByToken (R5) →
   * Zod (R4) → insert (R6); conflicto UNIQUE → estado `respondida` (R6); éxito → ok (R7).
   */
  responder: async ({ params, request, getClientAddress }) => {
    const form = await request.formData();
    const raw: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      raw[key] = value;
    }

    const result = await submitSurveyResponse({
      token: params.token,
      raw,
      clientIp: getClientAddress()
    });

    if (result.ok) {
      return { ok: true, encuesta: { estado: 'respondida', respuesta: result.respuesta } };
    }

    switch (result.reason) {
      case 'rate_limited':
        return fail(429, { ok: false, mensaje: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
      case 'unavailable':
        // Degradación amable de #15: token inválido/no aprobado (R5).
        error(404, INFORME_SHARE_UNAVAILABLE_MESSAGE);
        break;
      case 'already_answered':
        return fail(409, { ok: false, mensaje: 'Esta encuesta ya fue respondida.' });
      case 'invalid':
      default:
        return fail(400, {
          ok: false,
          mensaje: 'Revisá los datos: la valoración y la claridad van de 1 a 5.'
        });
    }
  }
};
