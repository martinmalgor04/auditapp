/**
 * Tests de integración para POST /forgot (R2–R7).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { resetPasswordResetRateLimit } from '../../src/lib/server/auth/rate-limit';
import { hashToken } from '../../src/lib/server/auth/password-reset';
import { actions } from '../../src/routes/forgot/+page.server';
import type postgres from 'postgres';

// Mock de sendEmail para no necesitar SMTP
vi.mock('../../src/lib/server/email/index', () => ({
  sendEmail: vi.fn().mockResolvedValue({ status: 'dry_run', logIds: ['mock-log-id'] })
}));

async function postForgot(email: unknown) {
  const formData = new FormData();
  if (email !== undefined) formData.set('email', String(email));
  try {
    const result = await actions.default({
      request: new Request('http://localhost/forgot', { method: 'POST', body: formData }),
      getClientAddress: () => '10.0.0.1'
    } as never);
    return result;
  } catch (err) {
    if (isRedirect(err)) throw err;
    return err;
  }
}

describe('POST /forgot (R2–R7)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
    process.env.PUBLIC_APP_URL = 'http://localhost:5173';
    process.env.NODE_ENV = 'test';
  }, 30_000);

  beforeEach(() => {
    resetPasswordResetRateLimit();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  afterEach(async () => {
    await sql`DELETE FROM password_reset_token`;
  });

  it('R2: email existente → respuesta neutra con ok:true', async () => {
    const result = await postForgot('admin@serviciosysistemas.com.ar');
    expect((result as { ok: boolean }).ok).toBe(true);
  });

  it('R2: email inexistente → misma respuesta neutra con ok:true', async () => {
    const result = await postForgot('no-existe@example.com');
    expect((result as { ok: boolean }).ok).toBe(true);
  });

  it('R3: email malformado → error de validación, sin token en DB', async () => {
    const result = await postForgot('no-es-email');
    // fail() devuelve un objeto con status
    const res = result as { status: number; data: { error: string } };
    expect(res.status).toBe(400);
    const rows = await sql`SELECT * FROM password_reset_token`;
    expect(rows).toHaveLength(0);
  });

  it('R4: email activo → genera token hasheado en DB', async () => {
    const { sendEmail } = await import('../../src/lib/server/email/index');
    await postForgot('admin@serviciosysistemas.com.ar');
    const rows = await sql<{ token_hash: string; used_at: Date | null; expires_at: Date }[]>`
      SELECT token_hash, used_at, expires_at FROM password_reset_token
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.used_at).toBeNull();
    expect(rows[0]!.expires_at > new Date()).toBe(true);
    // El hash tiene 64 chars (SHA-256 hex) y NO es el token en claro (base64url)
    expect(rows[0]!.token_hash).toHaveLength(64);
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it('R5: email inexistente → sin token en DB, sin sendEmail', async () => {
    const { sendEmail } = await import('../../src/lib/server/email/index');
    await postForgot('fantasma@example.com');
    const rows = await sql`SELECT * FROM password_reset_token`;
    expect(rows).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('R5: usuario inactivo → sin token, sin sendEmail', async () => {
    const { sendEmail } = await import('../../src/lib/server/email/index');
    const email = 'facu@serviciosysistemas.com.ar';
    await sql`UPDATE app_user SET active = false WHERE email = ${email}`;
    try {
      await postForgot(email);
      const rows = await sql`SELECT * FROM password_reset_token`;
      expect(rows).toHaveLength(0);
      expect(sendEmail).not.toHaveBeenCalled();
    } finally {
      await sql`UPDATE app_user SET active = true WHERE email = ${email}`;
    }
  });

  it('R6: segunda solicitud invalida la primera y solo queda un token utilizable', async () => {
    const email = 'admin@serviciosysistemas.com.ar';
    await postForgot(email);
    await postForgot(email);

    const rows = await sql<{ used_at: Date | null }[]>`
      SELECT used_at FROM password_reset_token ORDER BY created_at
    `;
    expect(rows).toHaveLength(2);
    // El primero debe estar invalidado (used_at no null)
    expect(rows[0]!.used_at).not.toBeNull();
    // El segundo debe ser utilizable (used_at null)
    expect(rows[1]!.used_at).toBeNull();
  });

  it('R7: sendEmail se invoca con password_reset, email del usuario y resetUrl con /reset/', async () => {
    const { sendEmail } = await import('../../src/lib/server/email/index');
    await postForgot('admin@serviciosysistemas.com.ar');
    expect(sendEmail).toHaveBeenCalledOnce();
    const [template, to, data] = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string,
      { resetUrl: string; nombre: string; expiraEnMin: number }
    ];
    expect(template).toBe('password_reset');
    expect(to).toBe('admin@serviciosysistemas.com.ar');
    expect(data.resetUrl).toContain('/reset/');
    expect(data.expiraEnMin).toBeGreaterThan(0);
  });
});
