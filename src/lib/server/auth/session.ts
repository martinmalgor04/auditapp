import { randomBytes } from 'node:crypto';
import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';
import { findUserById } from '../db/users';
import {
  deleteSession,
  findSessionById,
  insertSession,
  touchSessionExpiry,
  type SessionRow
} from '../db/sessions';
import type { AppUser } from './types';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_DAYS = 30;
export const SLIDING_RENEW_THRESHOLD_DAYS = 15;

const SESSION_MAX_AGE_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

function generateSessionId(): string {
  return randomBytes(32).toString('base64url');
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Genera id criptográfico (~32 bytes base64url) e inserta fila session. */
export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = generateSessionId();
  const expiresAt = addDays(new Date(), SESSION_TTL_DAYS);
  await insertSession(id, userId, expiresAt);
  return { id, expiresAt };
}

/** Resuelve el AppUser a partir de una fila session ya leída (evita re-query). */
export async function resolveSessionFromRow(session: SessionRow | null): Promise<AppUser | null> {
  if (!session) {
    return null;
  }

  if (session.expires_at.getTime() <= Date.now()) {
    return null;
  }

  const user = await findUserById(session.user_id);
  if (!user || !user.active) {
    return null;
  }

  return user;
}

/** Busca session + app_user activo; null si expirada o inexistente. */
export async function resolveSession(sessionId: string): Promise<AppUser | null> {
  return resolveSessionFromRow(await findSessionById(sessionId));
}

/**
 * Extiende expires_at si quedan <15 días. Retorna nueva fecha o null si no aplica.
 * `preloaded` permite reusar la fila ya leída por `resolveSession` (un SELECT menos
 * por request en el hot path de `hooks.server.ts`).
 */
export async function renewSessionIfNeeded(
  sessionId: string,
  preloaded?: SessionRow | null
): Promise<Date | null> {
  const session = preloaded !== undefined ? preloaded : await findSessionById(sessionId);
  if (!session) {
    return null;
  }

  const now = Date.now();
  if (session.expires_at.getTime() <= now) {
    return null;
  }

  const thresholdMs = SLIDING_RENEW_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  const remainingMs = session.expires_at.getTime() - now;

  if (remainingMs >= thresholdMs) {
    return null;
  }

  const newExpiry = addDays(new Date(), SESSION_TTL_DAYS);
  await touchSessionExpiry(sessionId, newExpiry);
  return newExpiry;
}

/** Borra fila session por id. */
export async function destroySession(sessionId: string): Promise<void> {
  await deleteSession(sessionId);
}

/** Secure cuando prod usa HTTPS (PUBLIC_APP_URL); en dev HTTP no marca Secure. */
export function shouldUseSecureCookies(
  overrides?: { dev?: boolean; publicAppUrl?: string }
): boolean {
  const isDev = overrides?.dev ?? dev;
  if (isDev) {
    return false;
  }
  const appUrl = overrides?.publicAppUrl ?? process.env.PUBLIC_APP_URL ?? '';
  return appUrl.startsWith('https://');
}

export function setSessionCookie(cookies: Cookies, sessionId: string): void {
  cookies.set(SESSION_COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS
  });
}

export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function getSessionIdFromCookies(cookies: Cookies): string | undefined {
  return cookies.get(SESSION_COOKIE);
}
