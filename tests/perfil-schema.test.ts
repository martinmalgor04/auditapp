import { describe, expect, it } from 'vitest';
import {
  passwordChangeSchema,
  profileUpdateSchema
} from '../src/lib/server/auth/profile';

describe('profileUpdateSchema (R3, R4)', () => {
  it('acepta nombre y email válidos y normaliza email a minúsculas', () => {
    const parsed = profileUpdateSchema.safeParse({
      name: '  Martín Malgor  ',
      email: '  Martin@Example.COM '
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe('Martín Malgor');
      expect(parsed.data.email).toBe('martin@example.com');
    }
  });

  it('rechaza nombre vacío', () => {
    expect(profileUpdateSchema.safeParse({ name: '   ', email: 'a@b.com' }).success).toBe(false);
  });

  it('rechaza email mal formado', () => {
    expect(profileUpdateSchema.safeParse({ name: 'Ok', email: 'no-es-email' }).success).toBe(false);
  });

  it('rechaza nombre que excede 120 chars', () => {
    expect(
      profileUpdateSchema.safeParse({ name: 'x'.repeat(121), email: 'a@b.com' }).success
    ).toBe(false);
  });

  it('rechaza email que excede 200 chars', () => {
    const longEmail = `${'a'.repeat(195)}@b.com`;
    expect(profileUpdateSchema.safeParse({ name: 'Ok', email: longEmail }).success).toBe(false);
  });

  it('R3: no contiene el campo role y .strict rechaza el extra', () => {
    expect(
      profileUpdateSchema.safeParse({ name: 'Ok', email: 'a@b.com', role: 'admin' }).success
    ).toBe(false);
    expect(Object.keys(profileUpdateSchema.shape)).not.toContain('role');
  });

  it('.strict rechaza cualquier campo extra (p.ej. userId)', () => {
    expect(
      profileUpdateSchema.safeParse({ name: 'Ok', email: 'a@b.com', userId: 'otro' }).success
    ).toBe(false);
  });
});

describe('passwordChangeSchema (R7, R8)', () => {
  const base = { actual: 'la-actual', nueva: 'abcdef1234', confirmacion: 'abcdef1234' };

  it('acepta una contraseña que cumple la política', () => {
    expect(passwordChangeSchema.safeParse(base).success).toBe(true);
  });

  it('rechaza contraseña corta (< 10)', () => {
    const r = passwordChangeSchema.safeParse({ ...base, nueva: 'abc123', confirmacion: 'abc123' });
    expect(r.success).toBe(false);
  });

  it('rechaza contraseña sin dígito', () => {
    const r = passwordChangeSchema.safeParse({
      ...base,
      nueva: 'sololetras',
      confirmacion: 'sololetras'
    });
    expect(r.success).toBe(false);
  });

  it('rechaza contraseña sin letra', () => {
    const r = passwordChangeSchema.safeParse({
      ...base,
      nueva: '1234567890',
      confirmacion: '1234567890'
    });
    expect(r.success).toBe(false);
  });

  it('rechaza contraseña > 200 chars', () => {
    const big = `a1${'x'.repeat(200)}`;
    const r = passwordChangeSchema.safeParse({ ...base, nueva: big, confirmacion: big });
    expect(r.success).toBe(false);
  });

  it('R8: rechaza cuando la confirmación no coincide', () => {
    const r = passwordChangeSchema.safeParse({ ...base, confirmacion: 'otracosa12' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === 'confirmacion')).toBe(true);
    }
  });

  it('.strict rechaza campos extra', () => {
    expect(passwordChangeSchema.safeParse({ ...base, userId: 'otro' }).success).toBe(false);
  });
});
