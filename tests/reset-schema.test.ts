import { describe, expect, it } from 'vitest';
import { resetPasswordSchema } from '../src/lib/server/auth/password-reset';

describe('resetPasswordSchema (R11)', () => {
  const base = { nueva: 'abcd1234', confirmacion: 'abcd1234' };

  it('acepta contraseña de exactamente 8 caracteres', () => {
    expect(resetPasswordSchema.safeParse(base).success).toBe(true);
  });

  it('acepta contraseña larga', () => {
    const s = 'x'.repeat(100);
    expect(resetPasswordSchema.safeParse({ nueva: s, confirmacion: s }).success).toBe(true);
  });

  it('rechaza contraseña corta (< 8 chars)', () => {
    const r = resetPasswordSchema.safeParse({ nueva: 'abc12', confirmacion: 'abc12' });
    expect(r.success).toBe(false);
  });

  it('rechaza contraseña > 200 chars', () => {
    const big = 'x'.repeat(201);
    const r = resetPasswordSchema.safeParse({ nueva: big, confirmacion: big });
    expect(r.success).toBe(false);
  });

  it('rechaza cuando confirmación no coincide (R11)', () => {
    const r = resetPasswordSchema.safeParse({ nueva: 'abcd1234', confirmacion: 'otra1234' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === 'confirmacion')).toBe(true);
    }
  });

  it('rechaza campos extra (strict)', () => {
    expect(resetPasswordSchema.safeParse({ ...base, userId: 'x' }).success).toBe(false);
  });
});
