import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
  BRIEFING_UNAVAILABLE_MESSAGE,
  resolveBriefingByToken
} from '$lib/server/auth/briefing-token';
import { BriefingUnavailableError } from '$lib/server/briefing/errors';
import { loadBriefingForm } from '$lib/server/briefing/load-form';
import { submitBriefing } from '$lib/server/briefing/submit';
import { validateBriefingToken } from '$lib/server/briefing/validate-token';

export const load: PageServerLoad = async ({ params }) => {
  const result = await resolveBriefingByToken(params.token);

  if (!result.ok) {
    return {
      available: false as const,
      message: BRIEFING_UNAVAILABLE_MESSAGE
    };
  }

  try {
    const ctx = await validateBriefingToken(params.token);
    const form = await loadBriefingForm(ctx);

    return {
      available: true as const,
      audit: {
        auditId: result.audit.auditId,
        clientId: result.audit.clientId,
        status: result.audit.status,
        publicToken: result.audit.publicToken
      },
      client: { razonSocial: ctx.client.razonSocial },
      items: form.items,
      stepCount: form.stepCount,
      token: params.token
    };
  } catch {
    return {
      available: false as const,
      message: BRIEFING_UNAVAILABLE_MESSAGE
    };
  }
};

export const actions: Actions = {
  submit: async ({ params }) => {
    const token = params.token;
    if (!token) {
      return fail(400, { success: false, error: 'Token requerido' });
    }
    try {
      await submitBriefing(token);
      return { success: true };
    } catch (err) {
      if (err instanceof BriefingUnavailableError) {
        return fail(403, { success: false, error: err.message });
      }
      return fail(500, { success: false, error: 'No se pudo enviar el briefing' });
    }
  }
};
