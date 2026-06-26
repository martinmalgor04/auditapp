# Design — #50 50_recuperar_contrasena

## Alcance

Flujo público de recuperación de contraseña por email. Dos rutas sin auth (`/forgot`,
`/reset/[token]`), token de un solo uso hasheado en DB con expiración corta, email branded vía el
servicio #49 (plantilla `password_reset`), reseteo con argon2id (`password.ts`), invalidación de
todas las sesiones del usuario, rate limit (patrón `rate-limit.ts`) y pantallas amables. Comparte la
política de fortaleza de contraseña con #48.

| Incluido (MVP) | Excluido |
|---|---|
| Rutas `/forgot` y `/reset/[token]` públicas, branded SyS (R1, R9, R10) | Cambio autenticado (#48), reset admin (#4) |
| Token `password_reset_token`: hash SHA-256, expiración, un-solo-uso (R4, R6, R13, R17) | Transporte SMTP / proveedor (#49) |
| Respuesta neutra anti-enumeración (R2, R3, R5) | Verificación de email, 2FA |
| Email branded vía `sendEmail('password_reset', ...)` + cuerpo de plantilla (R7, R8) | Cola persistente de envíos |
| Reseteo argon2id + consumo de token + invalidación total de sesiones, transaccional (R12–R15) | Rate limit distribuido |
| Rate limit por IP en `/forgot` y `/reset` (R16) | |

## Dependencias

| Feature | Contrato usado |
|---|---|
| `49_servicio_email` (#49) | `sendEmail('password_reset', to, { nombre, resetUrl, expiraEnMin })`; entrada reservada `password_reset` en `EMAIL_TEMPLATES` (`src/lib/server/email/templates.ts`) — acá se completa su `render`; `email_log`, dry-run |
| `03_auth_roles` (#3) | `hashPassword`/`verifyPassword` (`src/lib/server/auth/password.ts`); patrón token `randomBytes(32).toString('base64url')` (`session.ts`); `rate-limit.ts` (patrón ventana in-memory por IP) |
| `48_perfil_usuario` (#48) | `strongPassword` / política Zod (`src/lib/server/auth/profile.ts`); patrón `deleteOtherSessions` (`src/lib/server/db/sessions.ts`) — acá se necesita `deleteAllSessionsForUser` |
| `02_modelo_datos` (#2) | `runMigrations` (`src/lib/server/db/migrate.ts`), `migrations/NNN_*.sql`, `getSql`; tablas `app_user`, `session`; `findUserByEmail` (`src/lib/server/db/users.ts`) |
| `11_ui_branding_sys` (#11) | tokens `--sys-*` para las pantallas y el HTML del email | `38` toasts |
| `01_stack_scaffolding` (#1) | `PUBLIC_APP_URL` (para `resetUrl` absoluta), `logger`, `env.ts` |

## Arquitectura

```
GET /forgot                                          src/routes/forgot/+page.server.ts
   render formulario email (sin auth)                (R1)

POST /forgot
   isResetRateLimited(ip) → fail "demasiados intentos" (neutro)        (R16, R2)
   forgotSchema.safeParse(email) → fail formato (neutro)               (R3)
   requestPasswordReset(email)                        src/lib/server/auth/password-reset.ts
      findUserByEmail(email) → null o inactivo ⇒ no-op                 (R5)
      invalidar tokens previos del usuario (used_at = now())           (R6)
      token = randomBytes(32).base64url; hash = sha256(token)
      insertResetToken(userId, hash, expiresAt)                        (R4)
      resetUrl = `${PUBLIC_APP_URL}/reset/${token}`
      sendEmail('password_reset', user.email, { nombre, resetUrl, expiraEnMin }) (R7, R8)
   → siempre devuelve { ok: true } con mensaje neutro                  (R2)

GET /reset/[token]                                   src/routes/reset/[token]/+page.server.ts
   resolveResetToken(token) → vigente? render form : pantalla amable   (R9, R10)

POST /reset/[token]
   isResetRateLimited(ip) → fail                                       (R16)
   resetPasswordSchema.safeParse(form) → fail política/confirmación    (R11)
   completePasswordReset(token, nueva)                src/lib/server/auth/password-reset.ts
      resolveResetToken(token) inválido/expirado/usado ⇒ amable        (R10)
      TRANSACCIÓN:                                                     (R15)
        UPDATE app_user.password_hash = hashPassword(nueva)            (R12)
        UPDATE password_reset_token.used_at = now() (este token)       (R13)
        DELETE FROM session WHERE user_id = dueño                      (R14)
   → { ok: true } → redirect /login?reset=ok (toast)                   (R12)
```

**Decisión de capas:** la orquestación vive en `src/lib/server/auth/password-reset.ts` (dominio),
las form actions solo adaptan request → dominio → `fail`/redirect (igual que #48). El hash del
token y la transacción están en el dominio/DB, no en el componente Svelte (`docs/conventions.md`).

**Anti-enumeración (R2):** `requestPasswordReset` nunca señala si el usuario existe; la form action
siempre devuelve el mismo mensaje neutro tanto en éxito como en no-op (R5) y en error de formato
(R3). El envío de email se hace dentro del dominio y su fallo no cambia la respuesta (queda en
`email_log` por #49, que no lanza).

## Cambios de schema — migración `0NN_recuperar_contrasena.sql`

(0NN = siguiente número disponible al implementar; **va después** de la migración de #49
`0NN_servicio_email.sql`.)

### `password_reset_token`

| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK default `gen_random_uuid()` | |
| user_id | uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE | dueño del token |
| token_hash | text NOT NULL | **SHA-256 del token en claro** (nunca el token) (R4) |
| expires_at | timestamptz NOT NULL | now() + `PASSWORD_RESET_TTL_MIN` |
| used_at | timestamptz | NULL hasta consumirse (R13) / invalidarse (R6) |
| created_at | timestamptz NOT NULL DEFAULT now() | |

```sql
CREATE TABLE IF NOT EXISTS password_reset_token (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS password_reset_token_hash_uq ON password_reset_token (token_hash);
CREATE INDEX IF NOT EXISTS password_reset_token_user_idx ON password_reset_token (user_id);
CREATE INDEX IF NOT EXISTS password_reset_token_expires_idx ON password_reset_token (expires_at);
```

Idempotente (`IF NOT EXISTS`). Lookup por `token_hash` (índice único). `ON DELETE CASCADE` limpia
tokens si se borra el usuario. Sin `archived_at`: invalidar = `used_at`. La limpieza de tokens
vencidos puede ser un barrido futuro; fuera de alcance.

## Archivos a crear/modificar

### Migración y DB

| Archivo | Propósito |
|---|---|
| `migrations/0NN_recuperar_contrasena.sql` (nuevo, post-#49) | `password_reset_token` + índices (R17) |
| `src/lib/server/db/password-reset-tokens.ts` (nuevo) | `insertResetToken(userId, tokenHash, expiresAt)`; `findResetTokenByHash(tokenHash)`; `markResetTokenUsed(id)`; `invalidateUserResetTokens(userId)` (R4, R6, R10, R13). SQL parametrizado |
| `src/lib/server/db/sessions.ts` (extender) | `deleteAllSessionsForUser(userId)` → `DELETE FROM session WHERE user_id = $1` (R14). (`deleteOtherSessions` de #48 conserva la actual; acá se borran todas) |

### Dominio / schema

| Archivo | Propósito |
|---|---|
| `src/lib/server/auth/password-policy.ts` (nuevo, opcional) | Extraer `strongPassword` de #48 a un módulo común si conviene evitar duplicar la regla; reusado por #48 y #50. Si #48 no está aún implementado, declarar la regla aquí y que #48 la reuse |
| `src/lib/server/auth/password-reset.ts` (nuevo) | `forgotSchema` (Zod email); `resetPasswordSchema` (Zod `.strict`, `strongPassword` + confirmación cruzada, R11); `PASSWORD_RESET_TTL_MIN`; `hashToken(token)` (SHA-256 hex); `requestPasswordReset(email)` (R4–R7, no-op silencioso R5, neutralidad R2); `resolveResetToken(token)` → `{ ok, userId } | { ok:false, reason }` (R9, R10); `completePasswordReset(token, nueva)` (transacción R12–R15). No lanza por email (delega en #49) |
| `src/lib/server/auth/rate-limit.ts` (extender) | Generalizar el limiter a un `isRateLimited(key, ip)` o agregar `isPasswordResetRateLimited(ip)` reusando la misma ventana/umbral; mantener `isLoginRateLimited` intacto (R16) |

### Rutas (públicas, sin auth — fuera del shell `(app)`, como `/login` y `/briefing`)

| Archivo | Propósito |
|---|---|
| `src/routes/forgot/+page.server.ts` (nuevo) | `actions.default`: rate limit (R16) → `forgotSchema` (R3) → `requestPasswordReset` (R4–R7) → siempre `{ ok:true, neutral }` (R2) |
| `src/routes/forgot/+page.svelte` (nuevo) | Form email branded SyS, `use:enhance`, mensaje neutro tras submit (R1, R2) |
| `src/routes/reset/[token]/+page.server.ts` (nuevo) | `load`: `resolveResetToken(params.token)` → flag vigente/ inválido (R9, R10). `actions.default`: rate limit (R16) → `resetPasswordSchema` (R11) → `completePasswordReset` (R12–R15) → `redirect(303, '/login?reset=ok')` |
| `src/routes/reset/[token]/+page.svelte` (nuevo) | Si token vigente: form nueva+confirmación (R9); si no: pantalla amable con link a `/forgot` (R10). Branded SyS, toasts #38 |

### Plantilla email (completar la reservada de #49)

| Archivo | Cambio |
|---|---|
| `src/lib/server/email/templates.ts` (extender) | Completar el `render` de la entrada `password_reset` (su `schema` ya está declarado en #49): HTML branded SyS (layout #49) + texto plano con saludo a `nombre`, botón a `resetUrl`, aviso `expiraEnMin`, nota «si no lo solicitaste, ignorá este correo» (R8) |

### Tests

| Archivo | Cubre |
|---|---|
| `tests/forgot-schema.test.ts` | R3 (`forgotSchema` email) |
| `tests/reset-schema.test.ts` | R11 (`resetPasswordSchema`: fortaleza + confirmación) |
| `tests/passwordreset-schema.test.ts` | R17 (migración 2x idempotente; columnas/índices) |
| `tests/api/forgot.test.ts` | R2, R3, R4, R5, R6, R7 (neutra, token hasheado, no-op, invalidación previa, `sendEmail`) |
| `tests/api/reset.test.ts` | R9, R10, R11, R12, R13, R14, R15 (vigente/inválido, política, argon2id, un-solo-uso, sesiones, atomicidad) |
| `tests/email-templates.test.ts` (extender) | R8 (render `password_reset`) |
| `tests/passwordreset-rate-limit.test.ts` | R16 (umbral en `/forgot` y `/reset`) |
| `e2e/recuperar-contrasena.spec.ts` | R1, R18 (flujo forgot → mail dry-run → reset → login) |

## Firmas principales

```typescript
// src/lib/server/auth/password-reset.ts
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';

export const PASSWORD_RESET_TTL_MIN = 60; // decisión de puerta (30–60)

export const forgotSchema = z.object({ email: z.string().email() }).strict();

export const resetPasswordSchema = z
  .object({ nueva: strongPassword, confirmacion: z.string() })
  .strict()
  .refine((d) => d.nueva === d.confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion']
  });

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** No-op silencioso si el usuario no existe o está inactivo (R5). Nunca revela existencia (R2). */
export async function requestPasswordReset(email: string): Promise<void>;

export type ResetTokenResolution =
  | { ok: true; userId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' };
export async function resolveResetToken(token: string): Promise<ResetTokenResolution>;

export type ResetResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_token' | 'weak_password' | 'mismatch' };
export async function completePasswordReset(token: string, nueva: string): Promise<ResetResult>;

// src/lib/server/db/password-reset-tokens.ts
export type ResetTokenRow = {
  id: string; user_id: string; token_hash: string;
  expires_at: Date; used_at: Date | null; created_at: Date;
};
export async function insertResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<{ id: string }>;
export async function findResetTokenByHash(tokenHash: string): Promise<ResetTokenRow | null>;
export async function markResetTokenUsed(id: string): Promise<void>;
export async function invalidateUserResetTokens(userId: string): Promise<void>;

// src/lib/server/db/sessions.ts (extender)
export async function deleteAllSessionsForUser(userId: string): Promise<void>;

// src/lib/server/auth/rate-limit.ts (extender)
export function isPasswordResetRateLimited(clientIp: string, now?: number): boolean;
```

## Errores reutilizados / nuevos

- **Reusados:** `password.ts` (`hashPassword`/`verifyPassword`); patrón token de `session.ts`
  (`randomBytes(32).base64url`); `rate-limit.ts` (ventana in-memory por IP); `sendEmail` de #49 (no
  lanza, traza en `email_log`); `logger` con redacción.
- **Nuevos:** ninguna clase de error de dominio. Las funciones devuelven resultados discriminados
  (`ResetTokenResolution`, `ResetResult`); las form actions traducen a `fail`/redirect. El token en
  claro **nunca** se loguea ni se persiste; solo su SHA-256.

## Alternativas descartadas

| Alternativa | Motivo descarte |
|---|---|
| JWT firmado autocontenido (stateless) en lugar de tabla | No permite un-solo-uso ni invalidación al pedir otro token (R6, R13) sin denylist; la fila en DB con `used_at` es la fuente de verdad |
| Guardar el token en claro en DB | Filtración de DB = tomar cualguier cuenta. Se guarda solo SHA-256; el claro vive solo en el link del email (patrón estándar) |
| Mensaje distinto si el email no existe | Habilita enumeración de usuarios. Respuesta neutra siempre (R2, R5) |
| Reusar `deleteOtherSessions` de #48 | Conserva la sesión actual; en reset por mail no hay sesión «actual» de confianza, hay que borrar **todas** (R14) → `deleteAllSessionsForUser` |
| Reset por SMS/preguntas de seguridad | Fuera de alcance; SyS solo tiene email corporativo. El canal es #49 |
| Rate limit en tabla DB | El proyecto usa limiter in-memory por IP (#3); se mantiene la coherencia. Reevaluar con múltiples instancias |
| HMAC del token en vez de SHA-256 simple | El token ya es 32 bytes aleatorios (alta entropía); SHA-256 alcanza para que la DB no contenga el secreto. HMAC agregaría una clave a gestionar sin beneficio real acá |

## Decisiones de puerta (Martín, 2026-06-25 — RESUELTAS)

1. **Expiración del token (R4):** **60 min** — `PASSWORD_RESET_TTL_MIN = 60`.
2. **Política de fortaleza (R11):** **mínima, solo largo `>= 8`** (decisión compartida con #48).
   Se extrae a `password-policy.ts` como única fuente de verdad (NO se duplica).
3. **Dependencia de orden:** #50 asume #49 implementado primero (plantilla `password_reset`,
   `email_log`). La migración de #50 va **después** de la de #49.

## Open questions (puerta humana)

1. **Rate limit (R16):** reusar el patrón in-memory de #3 (5/min por IP) en ambas rutas. ¿OK ese
   umbral para `/reset`, o se quiere más estricto en `/forgot` por ser anti-enumeración?
   (decisión menor, se resuelve al implementar)
