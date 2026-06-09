import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticate } from '../../src/lib/server/auth/login';
import { actions } from '../../src/routes/login/+page.server';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { createTrackingCookies } from '../helpers/cookies';
import { resetLoginRateLimit } from '../../src/lib/server/auth/rate-limit';
import type postgres from 'postgres';

describe('auth logging safety', () => {
  let sql: postgres.Sql;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    resetLoginRateLimit();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(async () => {
    await teardownTestDb();
    vi.restoreAllMocks();
  });

  function allLogOutput(): string {
    return logSpy.mock.calls.flat().join(' ');
  }

  it('does not log passwords on failed authenticate', async () => {
    await authenticate('admin@serviciosysistemas.com.ar', 'secret-password-xyz');
    expect(allLogOutput()).not.toContain('secret-password-xyz');
  });

  it('does not log passwords on login action failure', async () => {
    const { cookies } = createTrackingCookies();
    const formData = new FormData();
    formData.set('email', 'admin@serviciosysistemas.com.ar');
    formData.set('password', 'my-plain-password');

    await actions.default({
      request: new Request('http://localhost/login', { method: 'POST', body: formData }),
      cookies,
      getClientAddress: () => '127.0.0.3',
      locals: { user: null }
    } as never);

    expect(allLogOutput()).not.toContain('my-plain-password');
  });

  it('does not log password hashes from database', async () => {
    const [user] = await sql<{ password_hash: string }[]>`
      SELECT password_hash FROM app_user WHERE email = 'admin@serviciosysistemas.com.ar'
    `;
    await authenticate('admin@serviciosysistemas.com.ar', 'changeme-admin');
    expect(allLogOutput()).not.toContain(user.password_hash);
  });
});
