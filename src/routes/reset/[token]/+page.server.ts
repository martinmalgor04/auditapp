import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isPasswordResetRateLimited } from '$lib/server/auth/rate-limit';
import {
  resetPasswordSchema,
  resolveResetToken,
  completePasswordReset
} from '$lib/server/auth/password-reset';

export const load: PageServerLoad = async ({ params }) => {
  const resolution = await resolveResetToken(params.token);

  if (!resolution.ok) {
    return { valid: false as const, reason: resolution.reason };
  }

  return { valid: true as const };
};

export const actions: Actions = {
  default: async ({ request, params, getClientAddress }) => {
    const clientIp = getClientAddress();

    // R16: rate limit por IP
    if (isPasswordResetRateLimited(clientIp)) {
      return fail(429, { error: 'Demasiados intentos. Probá de nuevo en un minuto.' });
    }

    const formData = await request.formData();
    const parsed = resetPasswordSchema.safeParse({
      nueva: formData.get('nueva'),
      confirmacion: formData.get('confirmacion')
    });

    // R11: validar política y confirmación
    if (!parsed.success) {
      const issues = parsed.error.issues;
      const errors: Record<string, string> = {};
      for (const issue of issues) {
        const key = (issue.path[0]?.toString() ?? '_') as string;
        if (!errors[key]) errors[key] = issue.message;
      }
      return fail(400, { errors });
    }

    // R12–R15: completar reseteo transaccional
    const result = await completePasswordReset(params.token, parsed.data.nueva);

    if (!result.ok) {
      return fail(400, { tokenInvalid: true });
    }

    // R12: redirect a login con toast de éxito
    redirect(303, '/login?reset=ok');
  }
};
