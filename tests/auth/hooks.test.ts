import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from '../../src/hooks.server';
import { createSession } from '../../src/lib/server/auth/session';
import { findUserIdByEmail } from '../helpers/auth';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { createTrackingCookies } from '../helpers/cookies';
import type postgres from 'postgres';

describe('hooks.server session resolution', () => {
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

  async function runHook(sessionId?: string) {
    const { cookies } = createTrackingCookies(
      sessionId ? { session: sessionId } : undefined
    );
    const locals: App.Locals = { user: null };

    const resolve = vi.fn(async () => new Response('ok'));

    await handle({
      event: {
        cookies,
        locals,
        url: new URL('http://localhost/'),
        request: new Request('http://localhost/'),
        getClientAddress: () => '127.0.0.1',
        params: {},
        route: { id: '/' },
        isDataRequest: false,
        isSubmitter: false,
        platform: undefined,
        setHeaders: () => {},
        depends: () => {},
        fetch: fetch,
        parent: async () => ({})
      } as never,
      resolve
    });

    return locals;
  }

  it('sets locals.user for valid session cookie', async () => {
    const { id } = await createSession(adminId);
    const locals = await runHook(id);

    expect(locals.user).not.toBeNull();
    expect(locals.user?.email).toBe('admin@serviciosysistemas.com.ar');
  });

  it('sets locals.user null for missing cookie', async () => {
    const locals = await runHook();
    expect(locals.user).toBeNull();
  });

  it('sets locals.user null for expired session', async () => {
    const { id } = await createSession(adminId);
    await sql`
      UPDATE session SET expires_at = ${new Date(Date.now() - 60_000)}
      WHERE id = ${id}
    `;

    const locals = await runHook(id);
    expect(locals.user).toBeNull();
  });

  it('sets locals.user null for unknown session id', async () => {
    const locals = await runHook('nonexistent-session-id');
    expect(locals.user).toBeNull();
  });
});
