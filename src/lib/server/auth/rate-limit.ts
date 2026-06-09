const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

type WindowState = {
  count: number;
  windowStart: number;
};

const loginAttempts = new Map<string, WindowState>();

/** Reinicia contador (solo tests). */
export function resetLoginRateLimit(): void {
  loginAttempts.clear();
}

/** Incrementa contador; retorna true si debe bloquearse (≥5 en 60s). */
export function isLoginRateLimited(clientIp: string): boolean {
  const now = Date.now();
  const state = loginAttempts.get(clientIp);

  if (!state || now - state.windowStart >= WINDOW_MS) {
    loginAttempts.set(clientIp, { count: 1, windowStart: now });
    return false;
  }

  state.count += 1;
  if (state.count > MAX_ATTEMPTS) {
    return true;
  }

  return false;
}
