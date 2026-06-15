import { beforeEach, describe, expect, it } from 'vitest';
import {
  _rateLimitSizeForTests,
  isLoginRateLimited,
  resetLoginRateLimit
} from '../../src/lib/server/auth/rate-limit';

const WINDOW_MS = 60_000;

describe('login rate limit', () => {
  beforeEach(() => {
    resetLoginRateLimit();
    delete process.env.LOGIN_RATE_LIMIT_DISABLED;
  });

  it('permite 5 intentos y bloquea a partir del 6º en la misma ventana', () => {
    const ip = '10.0.0.1';
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(isLoginRateLimited(ip, t0 + i)).toBe(false);
    }
    expect(isLoginRateLimited(ip, t0 + 5)).toBe(true);
  });

  it('reinicia el contador cuando pasa la ventana', () => {
    const ip = '10.0.0.2';
    const t0 = 2_000_000;
    for (let i = 0; i < 6; i++) isLoginRateLimited(ip, t0);
    expect(isLoginRateLimited(ip, t0)).toBe(true);
    // Nueva ventana → vuelve a permitir.
    expect(isLoginRateLimited(ip, t0 + WINDOW_MS)).toBe(false);
  });

  it('purga entradas vencidas del mapa (no hay memory leak)', () => {
    const t0 = 3_000_000;
    for (let i = 0; i < 50; i++) {
      isLoginRateLimited(`ip-${i}`, t0);
    }
    expect(_rateLimitSizeForTests()).toBe(50);

    // Avanzar más de una ventana y disparar una llamada → se purgan las 50.
    isLoginRateLimited('ip-nueva', t0 + 2 * WINDOW_MS);
    expect(_rateLimitSizeForTests()).toBe(1);
  });
});
