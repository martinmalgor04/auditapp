import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authenticate, GENERIC_LOGIN_ERROR } from '$lib/server/auth/login';
import { isLoginRateLimited } from '$lib/server/auth/rate-limit';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) {
    redirect(303, '/');
  }
};

export const actions: Actions = {
  default: async ({ request, cookies, getClientAddress }) => {
    const clientIp = getClientAddress();

    if (isLoginRateLimited(clientIp)) {
      return fail(429, {
        error: 'Demasiados intentos. Probá de nuevo en un minuto.'
      });
    }

    const formData = await request.formData();
    const parsed = loginSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password')
    });

    if (!parsed.success) {
      return fail(400, { error: GENERIC_LOGIN_ERROR });
    }

    const result = await authenticate(parsed.data.email, parsed.data.password);

    if (!result.ok) {
      return fail(400, { error: GENERIC_LOGIN_ERROR });
    }

    const { id: sessionId } = await createSession(result.userId);
    setSessionCookie(cookies, sessionId);

    redirect(303, '/');
  }
};
