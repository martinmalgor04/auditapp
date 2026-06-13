/**
 * Rate limit in-memory de la resolución pública de tokens de informe (R14).
 * Patrón briefing (src/lib/server/briefing/rate-limit.ts): la app corre en un
 * solo proceso (decisión deploy #10), no hace falta redis.
 */

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 60;

type WindowState = {
  count: number;
  windowStart: number;
};

const ipAttempts = new Map<string, WindowState>();

function checkLimit(store: Map<string, WindowState>, key: string): boolean {
  const now = Date.now();
  const state = store.get(key);

  if (!state || now - state.windowStart >= WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return false;
  }

  state.count += 1;
  return state.count > MAX_ATTEMPTS;
}

/** Reinicia contadores (solo tests). */
export function resetInformeShareRateLimit(): void {
  ipAttempts.clear();
}

/** Retorna true si debe bloquearse (≥60 resoluciones/min por IP). */
export function isInformeShareRateLimited(clientIp: string): boolean {
  return checkLimit(ipAttempts, clientIp);
}
