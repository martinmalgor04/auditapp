import { findUserByEmail } from '../db/users';
import { verifyPassword } from './password';

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid_credentials' | 'inactive' };

export const GENERIC_LOGIN_ERROR = 'usuario o contraseña incorrectos';

/** Valida credenciales; mensaje al cliente siempre genérico vía reason. */
export async function authenticate(email: string, password: string): Promise<LoginResult> {
  const user = await findUserByEmail(email);

  if (!user) {
    return { ok: false, reason: 'invalid_credentials' };
  }

  if (!user.active) {
    return { ok: false, reason: 'inactive' };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { ok: false, reason: 'invalid_credentials' };
  }

  return { ok: true, userId: user.id };
}
