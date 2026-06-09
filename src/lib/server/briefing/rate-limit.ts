const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 60;

type WindowState = {
  count: number;
  windowStart: number;
};

const ipAttempts = new Map<string, WindowState>();
const tokenAttempts = new Map<string, WindowState>();

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
export function resetBriefingRateLimit(): void {
  ipAttempts.clear();
  tokenAttempts.clear();
}

/** Retorna true si debe bloquearse (≥60 req/min por IP o token). */
export function isBriefingRateLimited(clientIp: string, token: string): boolean {
  return checkLimit(ipAttempts, clientIp) || checkLimit(tokenAttempts, token);
}
