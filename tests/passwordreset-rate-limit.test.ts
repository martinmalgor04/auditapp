/**
 * Tests de rate limit para /forgot y /reset (R16).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  isPasswordResetRateLimited,
  resetPasswordResetRateLimit,
  isLoginRateLimited,
  resetLoginRateLimit
} from '../src/lib/server/auth/rate-limit';

describe('isPasswordResetRateLimited (R16)', () => {
  beforeEach(() => {
    resetPasswordResetRateLimit();
  });

  it('permite los primeros 5 intentos', () => {
    for (let i = 0; i < 5; i++) {
      expect(isPasswordResetRateLimited('1.2.3.4')).toBe(false);
    }
  });

  it('el 6º intento es rechazado', () => {
    for (let i = 0; i < 5; i++) {
      isPasswordResetRateLimited('1.2.3.4');
    }
    expect(isPasswordResetRateLimited('1.2.3.4')).toBe(true);
  });

  it('IPs distintas no se afectan mutuamente', () => {
    for (let i = 0; i < 6; i++) {
      isPasswordResetRateLimited('1.2.3.4');
    }
    expect(isPasswordResetRateLimited('5.6.7.8')).toBe(false);
  });

  it('la ventana se reinicia pasado el tiempo (mock de now)', () => {
    const now = Date.now();
    for (let i = 0; i < 6; i++) {
      isPasswordResetRateLimited('1.2.3.4', now);
    }
    expect(isPasswordResetRateLimited('1.2.3.4', now)).toBe(true);
    // 61 segundos después la ventana se reinicia
    const later = now + 61_000;
    expect(isPasswordResetRateLimited('1.2.3.4', later)).toBe(false);
  });

  it('no interfiere con el rate limit de login (distintos mapas)', () => {
    resetLoginRateLimit();
    // Agotar rate limit de password reset
    for (let i = 0; i < 6; i++) {
      isPasswordResetRateLimited('9.9.9.9');
    }
    expect(isPasswordResetRateLimited('9.9.9.9')).toBe(true);
    // Login de la misma IP debe seguir libre
    expect(isLoginRateLimited('9.9.9.9')).toBe(false);
  });
});
