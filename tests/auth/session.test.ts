import { dev } from '$app/environment';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createSession,
  destroySession,
  renewSessionIfNeeded,
  resolveSession,
  SESSION_TTL_DAYS,
  setSessionCookie,
  clearSessionCookie
} from '../../src/lib/server/auth/session';
import { findUserIdByEmail } from '../helpers/auth';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { createTrackingCookies } from '../helpers/cookies';
import type postgres from 'postgres';

describe('session management', () => {
  let sql: postgres.Sql;
  let adminId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('creates a session row with ~30 day expiry', async () => {
    const { id, expiresAt } = await createSession(adminId);

    expect(id.length).toBeGreaterThan(20);

    const [row] = await sql<{ user_id: string; expires_at: Date }[]>`
      SELECT user_id, expires_at FROM session WHERE id = ${id}
    `;
    expect(row.user_id).toBe(adminId);

    const diffDays = (row.expires_at.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThan(SESSION_TTL_DAYS - 1);
    expect(diffDays).toBeLessThanOrEqual(SESSION_TTL_DAYS + 1);
    expect(expiresAt.getTime()).toBe(row.expires_at.getTime());
  });

  it('resolves active session to app user', async () => {
    const { id } = await createSession(adminId);
    const user = await resolveSession(id);

    expect(user).not.toBeNull();
    expect(user?.email).toBe('admin@serviciosysistemas.com.ar');
    expect(user?.role).toBe('admin');
  });

  it('returns null for expired session', async () => {
    const { id } = await createSession(adminId);
    await sql`
      UPDATE session SET expires_at = ${new Date(Date.now() - 60_000)}
      WHERE id = ${id}
    `;

    const user = await resolveSession(id);
    expect(user).toBeNull();
  });

  it('renews session when less than 15 days remain', async () => {
    const { id } = await createSession(adminId);
    const tenDaysFromNow = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await sql`UPDATE session SET expires_at = ${tenDaysFromNow} WHERE id = ${id}`;

    const renewed = await renewSessionIfNeeded(id);
    expect(renewed).not.toBeNull();

    const [row] = await sql<{ expires_at: Date }[]>`
      SELECT expires_at FROM session WHERE id = ${id}
    `;
    const diffDays = (row.expires_at.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThan(SESSION_TTL_DAYS - 1);
  });

  it('does not renew session with more than 15 days remaining', async () => {
    const { id } = await createSession(adminId);
    const [before] = await sql<{ expires_at: Date }[]>`
      SELECT expires_at FROM session WHERE id = ${id}
    `;

    const renewed = await renewSessionIfNeeded(id);
    expect(renewed).toBeNull();

    const [after] = await sql<{ expires_at: Date }[]>`
      SELECT expires_at FROM session WHERE id = ${id}
    `;
    expect(after.expires_at.getTime()).toBe(before.expires_at.getTime());
  });

  it('destroys session on logout', async () => {
    const { id } = await createSession(adminId);
    await destroySession(id);

    const rows = await sql`SELECT id FROM session WHERE id = ${id}`;
    expect(rows).toHaveLength(0);
  });

  it('sets secure session cookie attributes', () => {
    const { cookies, setCalls } = createTrackingCookies();
    setSessionCookie(cookies, 'test-session-id');

    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].name).toBe('session');
    expect(setCalls[0].value).toBe('test-session-id');
    expect(setCalls[0].options.httpOnly).toBe(true);
    expect(setCalls[0].options.secure).toBe(!dev);
    expect(setCalls[0].options.sameSite).toBe('lax');
    expect(setCalls[0].options.path).toBe('/');
  });

  it('clears session cookie', () => {
    const { cookies, deleteCalls, store } = createTrackingCookies({ session: 'abc' });
    clearSessionCookie(cookies);

    expect(store.has('session')).toBe(false);
    expect(deleteCalls[0].name).toBe('session');
  });
});
