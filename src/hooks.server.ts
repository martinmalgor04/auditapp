import type { Handle, HandleServerError, RequestEvent } from '@sveltejs/kit';
import {
  getSessionIdFromCookies,
  renewSessionIfNeeded,
  resolveSessionFromRow
} from '$lib/server/auth/session';
import { findSessionById } from '$lib/server/db/sessions';
import { logger } from '$lib/server/logger';

function requestContext(event: RequestEvent): Record<string, unknown> {
  return {
    method: event.request.method,
    path: event.url.pathname,
    routeId: event.route?.id ?? null,
    userId: event.locals.user?.id ?? null
  };
}

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = getSessionIdFromCookies(event.cookies);

  if (sessionId) {
    try {
      // Una sola lectura de la fila session, reusada para resolver y renovar.
      const session = await findSessionById(sessionId);
      event.locals.user = await resolveSessionFromRow(session);
      if (event.locals.user) {
        await renewSessionIfNeeded(sessionId, session);
      }
    } catch (err) {
      logger.warn('session_resolve_failed', requestContext(event), err);
      event.locals.user = null;
    }
  } else {
    event.locals.user = null;
  }

  const response = await resolve(event);

  if (response.status >= 500) {
    logger.warn('http_5xx', {
      ...requestContext(event),
      status: response.status
    });
  }

  return response;
};

export const handleError: HandleServerError = ({ error, event, status, message }) => {
  logger.error(
    'request_failed',
    {
      ...requestContext(event),
      status,
      clientMessage: message
    },
    error
  );

  return {
    message: status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal Error' : message
  };
};
