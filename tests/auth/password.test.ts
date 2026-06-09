import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/server/auth/password';

describe('password hashing', () => {
  it('hashes and verifies a password with argon2id', async () => {
    const plain = 'test-password-123';
    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    expect(hash.length).toBeGreaterThan(20);
    expect(await verifyPassword(plain, hash)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('correct');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
