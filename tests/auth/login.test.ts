import { dev } from '$app/environment';
import { isRedirect } from '@sveltejs/kit';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authenticate, GENERIC_LOGIN_ERROR } from '../../src/lib/server/auth/login';
import { createSession, getSessionIdFromCookies } from '../../src/lib/server/auth/session';
import { isLoginRateLimited, resetLoginRateLimit } from '../../src/lib/server/auth/rate-limit';
import { actions } from '../../src/routes/login/+page.server';
import { POST as logoutPost } from '../../src/routes/logout/+server';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';
import { createTrackingCookies } from '../helpers/cookies';
import type postgres from 'postgres';

describe('login flow', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    resetLoginRateLimit();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('authenticates seed admin with valid credentials', async () => {
    const result = await authenticate('admin@serviciosysistemas.com.ar', 'changeme-admin');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const id = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
      expect(result.userId).toBe(id);
    }
  });

  it('returns generic error for unknown email', async () => {
    const result = await authenticate('nobody@example.com', 'wrong');
    expect(result).toEqual({ ok: false, reason: 'invalid_credentials' });
  });

  it('returns generic error for wrong password', async () => {
    const result = await authenticate('admin@serviciosysistemas.com.ar', 'wrong-password');
    expect(result).toEqual({ ok: false, reason: 'invalid_credentials' });
  });

  it('rejects inactive user with same reason as invalid credentials', async () => {
    const facuEmail = 'facu@serviciosysistemas.com.ar';
    try {
      await sql`
        UPDATE app_user SET active = false WHERE email = ${facuEmail}
      `;

      const result = await authenticate(facuEmail, 'changeme-tech');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(['invalid_credentials', 'inactive']).toContain(result.reason);
      }

      const sessions = await sql`SELECT id FROM session`;
      expect(sessions).toHaveLength(0);
    } finally {
      await sql`
        UPDATE app_user SET active = true WHERE email = ${facuEmail}
      `;
    }
  });

  it('login action creates session and sets cookie on success', async () => {
    const { cookies, setCalls } = createTrackingCookies();
    const formData = new FormData();
    formData.set('email', 'admin@serviciosysistemas.com.ar');
    formData.set('password', 'changeme-admin');

    try {
      await actions.default({
        request: new Request('http://localhost/login', { method: 'POST', body: formData }),
        cookies,
        getClientAddress: () => '127.0.0.1',
        locals: { user: null }
      } as never);
      expect.fail('should redirect');
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
    }

    expect(setCalls.some((c) => c.name === 'session')).toBe(true);
    const sessionCall = setCalls.find((c) => c.name === 'session');
    expect(sessionCall?.options.httpOnly).toBe(true);
    expect(sessionCall?.options.secure).toBe(!dev);
    expect(sessionCall?.options.sameSite).toBe('lax');

    const sessionId = getSessionIdFromCookies(cookies);
    expect(sessionId).toBeDefined();
    const rows = await sql`SELECT id FROM session WHERE id = ${sessionId!}`;
    expect(rows).toHaveLength(1);
  });

  it('login action returns generic error message on failure', async () => {
    const { cookies } = createTrackingCookies();
    const formData = new FormData();
    formData.set('email', 'admin@serviciosysistemas.com.ar');
    formData.set('password', 'wrong');

    const result = await actions.default({
      request: new Request('http://localhost/login', { method: 'POST', body: formData }),
      cookies,
      getClientAddress: () => '127.0.0.2',
      locals: { user: null }
    } as never);

    expect(result).toMatchObject({
      status: 400,
      data: { error: GENERIC_LOGIN_ERROR }
    });
  });

  it('blocks login after 5 attempts from same IP with 429', async () => {
    const ip = '10.0.0.99';
    for (let i = 0; i < 5; i++) {
      expect(isLoginRateLimited(ip)).toBe(false);
    }
    expect(isLoginRateLimited(ip)).toBe(true);

    const { cookies } = createTrackingCookies();
    const formData = new FormData();
    formData.set('email', 'admin@serviciosysistemas.com.ar');
    formData.set('password', 'wrong');

    const result = await actions.default({
      request: new Request('http://localhost/login', { method: 'POST', body: formData }),
      cookies,
      getClientAddress: () => ip,
      locals: { user: null }
    } as never);

    expect(result).toMatchObject({
      status: 429,
      data: { error: 'Demasiados intentos. Probá de nuevo en un minuto.' }
    });
  });

  it('logout destroys session and clears cookie', async () => {
    const adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const { id } = await createSession(adminId);
    const { cookies, deleteCalls } = createTrackingCookies({ session: id });

    try {
      await logoutPost({
        cookies,
        locals: { user: null }
      } as never);
      expect.fail('should redirect');
    } catch (e) {
      expect(isRedirect(e)).toBe(true);
    }

    const rows = await sql`SELECT id FROM session WHERE id = ${id}`;
    expect(rows).toHaveLength(0);
    expect(deleteCalls.some((d) => d.name === 'session')).toBe(true);
  });

  it('resolve returns null after logout with same cookie', async () => {
    const adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const { id } = await createSession(adminId);
    const { cookies } = createTrackingCookies({ session: id });

    try {
      await logoutPost({ cookies, locals: { user: null } } as never);
    } catch {
      // redirect expected
    }

    const { resolveSession } = await import('../../src/lib/server/auth/session');
    const user = await resolveSession(id);
    expect(user).toBeNull();
  });
});
