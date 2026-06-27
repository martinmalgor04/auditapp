const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

type WindowState = {
  count: number;
  windowStart: number;
};

const loginAttempts = new Map<string, WindowState>();
let lastPrune = 0;

/** Reinicia contador (solo tests). */
export function resetLoginRateLimit(): void {
  loginAttempts.clear();
  lastPrune = 0;
}

/** Tamaño actual del mapa (solo tests, para verificar la purga). */
export function _rateLimitSizeForTests(): number {
  return loginAttempts.size;
}

/**
 * Elimina entradas con la ventana vencida. Throttled a una pasada por ventana
 * (`WINDOW_MS`) para no recorrer el mapa en cada login. Sin esto, el mapa crece
 * sin límite: una entrada por cada IP que haya intentado loguear alguna vez.
 */
function pruneExpired(now: number): void {
  if (now - lastPrune < WINDOW_MS) return;
  lastPrune = now;
  for (const [ip, state] of loginAttempts) {
    if (now - state.windowStart >= WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}

/**
 * Permite hasta `MAX_ATTEMPTS` (5) intentos por IP en una ventana de 60s;
 * retorna true a partir del 6º intento dentro de la misma ventana.
 *
 * Nota de despliegue (S4): `clientIp` viene de `getClientAddress()` de SvelteKit.
 * Detrás de un proxy, con `adapter-node`, configurá `ADDRESS_HEADER` (p.ej.
 * `X-Forwarded-For`) y `XFF_DEPTH` para que la IP sea la real del cliente y no
 * la del proxy; sin eso el rate-limit puede agrupar a todos bajo una sola IP
 * (over-block) o ser evadible spoofeando el header.
 *
 * `now` es inyectable solo para tests; en producción usa `Date.now()`.
 */
// ── Rate limit para recuperación de contraseña (#50 R16) ──────────────────────

const passwordResetAttempts = new Map<string, WindowState>();
let lastPrunePasswordReset = 0;

/** Reinicia contador de reseteo (solo tests). */
export function resetPasswordResetRateLimit(): void {
  passwordResetAttempts.clear();
  lastPrunePasswordReset = 0;
}

function pruneExpiredPasswordReset(now: number): void {
  if (now - lastPrunePasswordReset < WINDOW_MS) return;
  lastPrunePasswordReset = now;
  for (const [ip, state] of passwordResetAttempts) {
    if (now - state.windowStart >= WINDOW_MS) {
      passwordResetAttempts.delete(ip);
    }
  }
}

/**
 * Rate limit en `/forgot` y `/reset/[token]` (R16): ≤5 intentos por IP en 60s.
 * `now` inyectable para tests.
 */
export function isPasswordResetRateLimited(clientIp: string, now: number = Date.now()): boolean {
  if (process.env.LOGIN_RATE_LIMIT_DISABLED === '1') return false;

  pruneExpiredPasswordReset(now);

  const state = passwordResetAttempts.get(clientIp);

  if (!state || now - state.windowStart >= WINDOW_MS) {
    passwordResetAttempts.set(clientIp, { count: 1, windowStart: now });
    return false;
  }

  state.count += 1;
  if (state.count > MAX_ATTEMPTS) {
    return true;
  }

  return false;
}

// ── Rate limit para login (#3) ─────────────────────────────────────────────────

export function isLoginRateLimited(clientIp: string, now: number = Date.now()): boolean {
  // E2E (Playwright, workers seriales sobre una sola IP): la suite completa supera
  // los 5 logins/min legítimos. Solo se desactiva con el flag explícito de tests.
  if (process.env.LOGIN_RATE_LIMIT_DISABLED === '1') return false;

  pruneExpired(now);

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
