/**
 * Rate limit en memoria para la API de escaneo (#60). Mismo patrón Map +
 * prune throttled de `auth/rate-limit.ts`, con flag
 * `ESCANEO_RATE_LIMIT_DISABLED=1` para tests E2E (espejo de
 * `LOGIN_RATE_LIMIT_DISABLED`).
 *
 * Claves por token (hash SHA-256, nunca el claro) para ingesta y resto: el
 * agente sale a internet desde la red del cliente (IP variable y compartida),
 * así que la unidad natural de abuso es el token. Por IP solo fallos de auth.
 */
const WINDOW_MS = 60_000;
const MAX_INGESTA_POR_MIN = 30; // R23 — solo POST dispositivos
const MAX_AGENTE_POR_MIN = 60; // R24 — resto de endpoints del agente
const MAX_AUTH_FAILS_POR_MIN = 10; // R25 — fallos de auth de token por IP

type WindowState = {
  count: number;
  windowStart: number;
};

type Limiter = {
  isLimited(key: string, now?: number): boolean;
  reset(): void;
};

function createLimiter(maxPerWindow: number): Limiter {
  const attempts = new Map<string, WindowState>();
  let lastPrune = 0;

  // Una pasada de purga por ventana: sin esto el mapa crece sin límite.
  function pruneExpired(now: number): void {
    if (now - lastPrune < WINDOW_MS) return;
    lastPrune = now;
    for (const [key, state] of attempts) {
      if (now - state.windowStart >= WINDOW_MS) {
        attempts.delete(key);
      }
    }
  }

  return {
    isLimited(key: string, now: number = Date.now()): boolean {
      if (process.env.ESCANEO_RATE_LIMIT_DISABLED === '1') return false;

      pruneExpired(now);

      const state = attempts.get(key);
      if (!state || now - state.windowStart >= WINDOW_MS) {
        attempts.set(key, { count: 1, windowStart: now });
        return false;
      }

      state.count += 1;
      return state.count > maxPerWindow;
    },
    reset(): void {
      attempts.clear();
      lastPrune = 0;
    }
  };
}

const ingestaLimiter = createLimiter(MAX_INGESTA_POR_MIN);
const agenteLimiter = createLimiter(MAX_AGENTE_POR_MIN);
const tokenAuthLimiter = createLimiter(MAX_AUTH_FAILS_POR_MIN);

/** 30 req/min por token — solo POST dispositivos (R23). */
export function isIngestaRateLimited(tokenHash: string, now?: number): boolean {
  return ingestaLimiter.isLimited(tokenHash, now);
}

/** 60 req/min por token — resto de endpoints del agente (R24). */
export function isAgenteRateLimited(tokenHash: string, now?: number): boolean {
  return agenteLimiter.isLimited(tokenHash, now);
}

/**
 * 10 fallos de auth/min por IP (R25). Se invoca SOLO en el camino de fallo:
 * incrementa y devuelve true cuando la IP superó el límite (→ 429 en vez de 401).
 */
export function isTokenAuthRateLimited(clientIp: string, now?: number): boolean {
  return tokenAuthLimiter.isLimited(clientIp, now);
}

/** Reinicia los tres limitadores (solo tests). */
export function resetEscaneoRateLimits(): void {
  ingestaLimiter.reset();
  agenteLimiter.reset();
  tokenAuthLimiter.reset();
}
