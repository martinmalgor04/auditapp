import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isPasswordResetRateLimited } from '$lib/server/auth/rate-limit';
import { forgotSchema, requestPasswordReset } from '$lib/server/auth/password-reset';

/** Ruta pública — sin auth requerida. */
export const load: PageServerLoad = async () => {
  return {};
};

/** Mensaje neutro que se muestra siempre (anti-enumeración R2). */
const NEUTRAL_MESSAGE =
  'Si el email corresponde a una cuenta activa, te enviamos un enlace para restablecer la contraseña.';

export const actions: Actions = {
  default: async ({ request, getClientAddress }) => {
    const clientIp = getClientAddress();

    // R16: rate limit por IP (5/min)
    if (isPasswordResetRateLimited(clientIp)) {
      // Respuesta neutra incluso ante rate limit (R2)
      return { ok: true, message: NEUTRAL_MESSAGE };
    }

    const formData = await request.formData();
    const parsed = forgotSchema.safeParse({ email: formData.get('email') });

    // R3: email inválido → error de formato (no revela existencia)
    if (!parsed.success) {
      return fail(400, { error: 'El email ingresado no tiene un formato válido.' });
    }

    // R4, R5, R6, R7: orquestación en dominio (no-op silencioso si no existe/inactivo)
    await requestPasswordReset(parsed.data.email);

    // R2: respuesta siempre neutra
    return { ok: true, message: NEUTRAL_MESSAGE };
  }
};
