import type { Handle } from '@sveltejs/kit';
import {
  getSessionIdFromCookies,
  renewSessionIfNeeded,
  resolveSession
} from '$lib/server/auth/session';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = getSessionIdFromCookies(event.cookies);

  if (sessionId) {
    try {
      event.locals.user = await resolveSession(sessionId);
      if (event.locals.user) {
        await renewSessionIfNeeded(sessionId);
      }
    } catch {
      event.locals.user = null;
    }
  } else {
    event.locals.user = null;
  }

  return resolve(event);
};
