import { error, fail, isRedirect } from '@sveltejs/kit';
import { AuthError, requireAdmin } from '$lib/server/auth/guards';
import { logger } from '$lib/server/logger';
import { BackofficeError } from './errors';

export function requireAdminPage(locals: App.Locals) {
  try {
    return requireAdmin(locals);
  } catch (e) {
    if (isRedirect(e)) {
      throw e;
    }
    if (e instanceof AuthError) {
      error(e.status, e.message);
    }
    throw e;
  }
}

export function handleLoadError(e: unknown): never {
  if (isRedirect(e)) {
    throw e;
  }
  if (e instanceof AuthError) {
    error(e.status, e.message);
  }
  if (e instanceof BackofficeError) {
    error(e.status, e.message);
  }
  throw e;
}

export function failFromError(e: unknown) {
  if (e instanceof BackofficeError) {
    return fail(e.status, { error: e.message, code: e.code });
  }
  if (e instanceof AuthError) {
    return fail(e.status, { error: e.message, code: e.code });
  }
  logger.error('action_unhandled_error', {}, e);
  throw e;
}
