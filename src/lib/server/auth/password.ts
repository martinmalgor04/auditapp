import { hash, verify } from '@node-rs/argon2';

/** Hash argon2id para persistir en app_user.password_hash. */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/** Compara plain contra hash almacenado; timing-safe vía librería. */
export async function verifyPassword(plain: string, storedHash: string): Promise<boolean> {
  return verify(storedHash, plain);
}
