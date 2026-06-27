/**
 * Tests de integración para GET+POST /reset/[token] (R9–R15).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { resetPasswordResetRateLimit } from '../../src/lib/server/auth/rate-limit';
import { hashToken, PASSWORD_RESET_TTL_MIN } from '../../src/lib/server/auth/password-reset';
import { insertResetToken } from '../../src/lib/server/db/password-reset-tokens';
import { verifyPassword } from '../../src/lib/server/auth/password';
import { insertSession } from '../../src/lib/server/db/sessions';
import { load, actions } from '../../src/routes/reset/[token]/+page.server';
import { randomBytes } from 'node:crypto';
import type postgres from 'postgres';

function makeToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

async function makeValidToken(sql: postgres.Sql, userId: string) {
  const { token, tokenHash } = makeToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MIN * 60 * 1000);
  await insertResetToken(userId, tokenHash, expiresAt);
  return token;
}

async function getUserId(sql: postgres.Sql, email: string): Promise<string> {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM app_user WHERE email = ${email}`;
  if (!row) throw new Error(`User not found: ${email}`);
  return row.id;
}

async function getPasswordHash(sql: postgres.Sql, userId: string): Promise<string> {
  const [row] = await sql<{ password_hash: string }[]>`
    SELECT password_hash FROM app_user WHERE id = ${userId}
  `;
  return row!.password_hash;
}

type LoadResult =
  | { valid: true }
  | { valid: false; reason: 'not_found' | 'expired' | 'used' };

async function doLoad(token: string): Promise<LoadResult> {
  return load({ params: { token } } as never) as Promise<LoadResult>;
}

async function doPost(token: string, nueva: string, confirmacion?: string) {
  const formData = new FormData();
  formData.set('nueva', nueva);
  formData.set('confirmacion', confirmacion ?? nueva);
  try {
    const result = await actions.default({
      request: new Request(`http://localhost/reset/${token}`, {
        method: 'POST',
        body: formData
      }),
      params: { token },
      getClientAddress: () => '10.0.0.2'
    } as never);
    return result;
  } catch (err) {
    if (isRedirect(err)) return { redirected: true, err };
    throw err;
  }
}

describe('GET /reset/[token] (R9, R10)', () => {
  let sql: postgres.Sql;
  let adminId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
    adminId = await getUserId(sql, 'admin@serviciosysistemas.com.ar');
  }, 30_000);

  beforeEach(() => {
    resetPasswordResetRateLimit();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  afterEach(async () => {
    await sql`DELETE FROM password_reset_token`;
    await sql`DELETE FROM session WHERE user_id = ${adminId}`;
  });

  it('R9: token vigente → load retorna valid:true', async () => {
    const token = await makeValidToken(sql, adminId);
    const data = await doLoad(token);
    expect(data.valid).toBe(true);
  });

  it('R10: token inexistente → valid:false reason:not_found', async () => {
    const data = await doLoad('token-falso-inexistente');
    expect(data.valid).toBe(false);
    if (!data.valid) expect(data.reason).toBe('not_found');
  });

  it('R10: token expirado → valid:false reason:expired', async () => {
    const { token, tokenHash } = makeToken();
    const expired = new Date(Date.now() - 1000); // ya expirado
    await insertResetToken(adminId, tokenHash, expired);
    const data = await doLoad(token);
    expect(data.valid).toBe(false);
    if (!data.valid) expect(data.reason).toBe('expired');
  });

  it('R10: token ya usado → valid:false reason:used', async () => {
    const token = await makeValidToken(sql, adminId);
    await sql`UPDATE password_reset_token SET used_at = now() WHERE token_hash = ${hashToken(token)}`;
    const data = await doLoad(token);
    expect(data.valid).toBe(false);
    if (!data.valid) expect(data.reason).toBe('used');
  });
});

describe('POST /reset/[token] (R11–R15)', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let originalHash: string;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
    adminId = await getUserId(sql, 'admin@serviciosysistemas.com.ar');
    originalHash = await getPasswordHash(sql, adminId);
    process.env.PUBLIC_APP_URL = 'http://localhost:5173';
  }, 30_000);

  beforeEach(() => {
    resetPasswordResetRateLimit();
  });

  afterAll(async () => {
    // Restaurar password original
    await sql`UPDATE app_user SET password_hash = ${originalHash} WHERE id = ${adminId}`;
    await teardownTestDb();
  });

  afterEach(async () => {
    await sql`DELETE FROM password_reset_token`;
    await sql`DELETE FROM session WHERE user_id = ${adminId}`;
    // Restaurar password
    await sql`UPDATE app_user SET password_hash = ${originalHash} WHERE id = ${adminId}`;
  });

  it('R11: contraseña débil (< 8 chars) → fallo sin cambiar hash ni token', async () => {
    const token = await makeValidToken(sql, adminId);
    const result = await doPost(token, 'abc12', 'abc12');
    const res = result as { status: number };
    expect(res.status).toBe(400);
    const currentHash = await getPasswordHash(sql, adminId);
    expect(currentHash).toBe(originalHash);
    const [row] = await sql<{ used_at: Date | null }[]>`
      SELECT used_at FROM password_reset_token WHERE token_hash = ${hashToken(token)}
    `;
    expect(row!.used_at).toBeNull();
  });

  it('R11: confirmación que no coincide → fallo', async () => {
    const token = await makeValidToken(sql, adminId);
    const result = await doPost(token, 'nuevapass1', 'otrapass1');
    const res = result as { status: number };
    expect(res.status).toBe(400);
  });

  it('R12: reseteo exitoso → argon2id verifica nueva contraseña', async () => {
    const token = await makeValidToken(sql, adminId);
    const result = await doPost(token, 'nuevapass1234');
    expect((result as { redirected: boolean }).redirected).toBe(true);
    const newHash = await getPasswordHash(sql, adminId);
    expect(newHash).not.toBe(originalHash);
    expect(await verifyPassword('nuevapass1234', newHash)).toBe(true);
  });

  it('R13: token consumido tras reseteo → segundo POST falla', async () => {
    const token = await makeValidToken(sql, adminId);
    await doPost(token, 'nuevapass1234');
    const result2 = await doPost(token, 'otrapass9999');
    const res = result2 as { status: number };
    expect(res.status).toBe(400);
    // La contraseña no cambió de nuevo (sigue siendo la del primer reseteo)
    const finalHash = await getPasswordHash(sql, adminId);
    expect(await verifyPassword('nuevapass1234', finalHash)).toBe(true);
    expect(await verifyPassword('otrapass9999', finalHash)).toBe(false);
  });

  it('R14: reseteo invalida todas las sesiones del usuario', async () => {
    // Crear algunas sesiones
    const sess1 = randomBytes(16).toString('hex');
    const sess2 = randomBytes(16).toString('hex');
    const far = new Date(Date.now() + 86400_000);
    await insertSession(sess1, adminId, far);
    await insertSession(sess2, adminId, far);
    const before = await sql`SELECT id FROM session WHERE user_id = ${adminId}`;
    expect(before).toHaveLength(2);

    const token = await makeValidToken(sql, adminId);
    await doPost(token, 'nuevapass1234');

    const after = await sql`SELECT id FROM session WHERE user_id = ${adminId}`;
    expect(after).toHaveLength(0);
  });

  it('R10: token inválido en POST → fail tokenInvalid, sin cambiar hash', async () => {
    const result = await doPost('token-falso', 'nuevapass1234');
    const res = result as { status: number; data: { tokenInvalid: boolean } };
    expect(res.status).toBe(400);
    expect(res.data?.tokenInvalid).toBe(true);
    const currentHash = await getPasswordHash(sql, adminId);
    expect(currentHash).toBe(originalHash);
  });
});
