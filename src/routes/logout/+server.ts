import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  clearSessionCookie,
  destroySession,
  getSessionIdFromCookies
} from '$lib/server/auth/session';

export const POST: RequestHandler = async ({ cookies }) => {
  const sessionId = getSessionIdFromCookies(cookies);
  if (sessionId) {
    await destroySession(sessionId);
  }
  clearSessionCookie(cookies);
  redirect(303, '/login');
};

export const GET: RequestHandler = POST;
