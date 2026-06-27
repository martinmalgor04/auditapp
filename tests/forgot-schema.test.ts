import { describe, expect, it } from 'vitest';
import { forgotSchema } from '../src/lib/server/auth/password-reset';

describe('forgotSchema (R3)', () => {
  it('acepta un email válido', () => {
    expect(forgotSchema.safeParse({ email: 'user@example.com' }).success).toBe(true);
  });

  it('rechaza email sin @', () => {
    expect(forgotSchema.safeParse({ email: 'no-es-email' }).success).toBe(false);
  });

  it('rechaza email vacío', () => {
    expect(forgotSchema.safeParse({ email: '' }).success).toBe(false);
  });

  it('rechaza campo extra (strict)', () => {
    expect(forgotSchema.safeParse({ email: 'a@b.com', extra: 'x' }).success).toBe(false);
  });

  it('rechaza ausencia de email', () => {
    expect(forgotSchema.safeParse({}).success).toBe(false);
  });
});
