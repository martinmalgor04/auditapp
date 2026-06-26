import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireUser } from '$lib/server/auth/guards';
import { getSessionIdFromCookies } from '$lib/server/auth/session';
import { changePassword, updateProfile } from '$lib/server/auth/profile';

export const load: PageServerLoad = async ({ locals }) => {
  // R1: sin sesión → redirect 303 /login. R2/R12: datos derivados de locals.user.
  const user = requireUser(locals);
  return {
    name: user.name,
    email: user.email,
    role: user.role
  };
};

export const actions: Actions = {
  // Edición de datos propios (R3, R4, R5, R12).
  perfil: async ({ request, locals }) => {
    const user = requireUser(locals);
    const formData = await request.formData();

    // R3/R12: solo leemos los campos del schema; `role`/`userId` inyectados se ignoran.
    const raw = {
      name: String(formData.get('name') ?? ''),
      email: String(formData.get('email') ?? '')
    };

    const result = await updateProfile({ user, raw });

    if (!result.ok) {
      if (result.reason === 'email_in_use') {
        return fail(409, {
          form: 'perfil' as const,
          error: 'Ese email ya está en uso',
          errors: { email: 'Ese email ya está en uso' }
        });
      }
      return fail(400, {
        form: 'perfil' as const,
        error: 'Revisá los datos del formulario',
        errors: result.errors
      });
    }

    return { form: 'perfil' as const, ok: true, message: 'Perfil actualizado' };
  },

  // Cambio de contraseña (R6–R12).
  password: async ({ request, locals, cookies }) => {
    const user = requireUser(locals);
    const currentSessionId = getSessionIdFromCookies(cookies);

    if (!currentSessionId) {
      return fail(401, {
        form: 'password' as const,
        error: 'Sesión no válida. Volvé a iniciar sesión.'
      });
    }

    const formData = await request.formData();
    const raw = {
      actual: String(formData.get('actual') ?? ''),
      nueva: String(formData.get('nueva') ?? ''),
      confirmacion: String(formData.get('confirmacion') ?? '')
    };

    const result = await changePassword({ user, currentSessionId, raw });

    if (!result.ok) {
      if (result.reason === 'wrong_current') {
        return fail(400, {
          form: 'password' as const,
          error: 'La contraseña actual no es correcta',
          errors: { actual: 'La contraseña actual no es correcta' }
        });
      }
      if (result.reason === 'same_as_current') {
        return fail(400, {
          form: 'password' as const,
          error: 'La nueva contraseña debe ser distinta de la actual',
          errors: { nueva: 'La nueva contraseña debe ser distinta de la actual' }
        });
      }
      return fail(400, {
        form: 'password' as const,
        error: 'Revisá los datos del formulario',
        errors: result.errors
      });
    }

    return { form: 'password' as const, ok: true, message: 'Contraseña actualizada' };
  }
};
