# Design — #48 48_perfil_usuario

## Alcance

Ruta protegida `/(app)/perfil` donde el usuario autenticado (admin o técnico) ve y edita sus
propios datos (nombre visible = `app_user.name`, email) y cambia su contraseña. El rol es solo
lectura. El cambio de contraseña reusa argon2id (`password.ts`), exige la actual + nueva +
confirmación con política Zod, e invalida las demás sesiones del usuario salvo la actual
(`session.ts` + nueva query de DB). Feedback con toast (#38), branding SyS (#11), mobile-first.

| Incluido (MVP) | Excluido |
|---|---|
| Ruta `(app)/perfil` con dos form actions: `?/perfil` y `?/password` | Reset por mail / token (#50) |
| `profileUpdateSchema` y `passwordChangeSchema` (Zod `.strict`) | ABM de otros usuarios / reset admin (#4) |
| `updateUserProfile`, `updateUserPasswordHash`, `deleteOtherSessions` (DB) | Verificación de email por correo |
| Verificación de actual (`verifyPassword`) + re-hash (`hashPassword`) | 2FA / listado de dispositivos |
| Invalidación de demás sesiones salvo la actual | Migración (no hace falta columna nueva) |
| Toasts éxito/error branded, mobile-first | |

## Dependencias

| Feature | Contrato usado |
|---|---|
| `03_auth_roles` (#3) | `hashPassword`/`verifyPassword` (`src/lib/server/auth/password.ts`); `destroySession`, `SESSION_COOKIE`, `getSessionIdFromCookies`, `setSessionCookie` (`src/lib/server/auth/session.ts`); `requireUser` (`src/lib/server/auth/guards.ts`); `findUserById`, `findUserByEmail` (`src/lib/server/db/users.ts`); `AppUser`, `UserRole` (`src/lib/server/auth/types.ts`); tablas `app_user`, `session` |
| `04_backoffice` (#4) | shell autenticado `(app)`, `hooks.server.ts` setea `locals.user` |
| `11_ui_branding_sys` (#11) | tokens `--sys-*`, Montserrat |
| `#37/#38` | patrón de toast de éxito/error (componente existente, p.ej. `src/lib/components/form/SaveErrorToast.svelte`) |

**Decisión de identidad:** todas las operaciones derivan el sujeto de `locals.user` (seteado por
`hooks.server.ts` a partir de la cookie de sesión). No hay parámetro de id de usuario en la ruta
ni se lee `userId` del body (R12). Esto evita por construcción que un usuario toque a otro.

## Arquitectura

```
usuario autenticado abre GET /(app)/perfil
   requireUser(locals)  → si no hay user, redirect 303 /login            (R1)
   load devuelve { name, email, role } de locals.user                    (R2)
        ▼
 +page.svelte: form "Datos" (name, email; rol read-only) + form "Contraseña"
        ▼
POST /(app)/perfil?/perfil   (editar datos)
   requireUser(locals)                                                    (R12)
   profileUpdateSchema.safeParse(form) → fail(400, errores por campo)     (R3, R4)
   email distinto y ya usado por OTRO user → fail("email en uso")         (R5)
   updateUserProfile(locals.user.id, { name, email })                     (R4)
   éxito → { ok: true } → toast de éxito (recarga locals.user vía invalidate)(R13)
        ▼
POST /(app)/perfil?/password (cambiar contraseña)
   requireUser(locals)                                                    (R12)
   passwordChangeSchema.safeParse(form)                                   (R7, R8)
     → mín 10 / máx 200 / letra+dígito / nueva===confirmacion
     → fail(400, errores por caso) si inválido
   findUserByEmail(locals.user.email) → passwordHash                      (R6)
   verifyPassword(actual, passwordHash) === false → fail("actual incorrecta")(R6)
   nueva === actual → fail("debe ser distinta")                          (R9)
   hash = hashPassword(nueva)                                            (R10)
   updateUserPasswordHash(locals.user.id, hash)                          (R10)
   deleteOtherSessions(locals.user.id, currentSessionId)                 (R11)
   éxito → { ok: true } → toast de éxito                                 (R13)
```

Capas: DB (`src/lib/server/db/users.ts` extendido + `sessions.ts` extendido), dominio/schema
(`src/lib/server/auth/profile.ts` nuevo), ruta `(app)/perfil` (form actions + Svelte), UI
(componente de perfil + toast reusado de #38).

## Cambios de schema (migración)

**No requerida.** `app_user.name` ya cumple como nombre visible (ver `src/lib/server/db/users.ts`
y `src/lib/server/auth/types.ts`: `AppUser.name`). No se agrega columna ni migración en esta
feature. Si la puerta decide separar nombre legal de nombre visible, recién ahí se crearía
`migrations/026_perfil_display_name.sql` idempotente (`ALTER TABLE app_user ADD COLUMN IF NOT
EXISTS display_name text;`). Queda como Open question.

## Archivos a crear/modificar

### DB

| Archivo | Propósito |
|---|---|
| `src/lib/server/db/users.ts` (extender) | `updateUserProfile(id, { name, email })` (UPDATE name/email; captura UNIQUE de email `23505` → señal de email en uso, R4/R5); `updateUserPasswordHash(id, hash)` (UPDATE password_hash, R10); `findUserByEmailExcept(email, excludeId)` opcional para chequear colisión antes del UPDATE (R5) |
| `src/lib/server/db/sessions.ts` (extender) | `deleteOtherSessions(userId, keepSessionId)` → `DELETE FROM session WHERE user_id = $1 AND id <> $2` (R11) |

### Dominio / schema

| Archivo | Propósito |
|---|---|
| `src/lib/server/auth/profile.ts` (nuevo) | `profileUpdateSchema` (Zod `.strict`, sin campo `role`, R3/R4); `passwordChangeSchema` (Zod `.strict`, política de fortaleza + cross-field, R7/R8); `changePassword({ user, currentSessionId, raw })` que orquesta verificación (R6), nueva≠actual (R9), re-hash (R10) e invalidación (R11); `updateProfile({ user, raw })` que valida (R4) y chequea unicidad de email (R5); tipos de resultado discriminados |

```typescript
// src/lib/server/auth/profile.ts
import { z } from 'zod';

export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(200)
  })
  .strict();
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

const strongPassword = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(200, 'La contraseña es demasiado larga')
  .refine((v) => /[A-Za-z]/.test(v), 'Debe incluir al menos una letra')
  .refine((v) => /[0-9]/.test(v), 'Debe incluir al menos un número');

export const passwordChangeSchema = z
  .object({
    actual: z.string().min(1, 'Ingresá tu contraseña actual'),
    nueva: strongPassword,
    confirmacion: z.string().min(1)
  })
  .strict()
  .refine((d) => d.nueva === d.confirmacion, {
    path: ['confirmacion'],
    message: 'La confirmación no coincide'
  });
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

export type ProfileResult =
  | { ok: true }
  | { ok: false; reason: 'invalid'; errors: Record<string, string> }
  | { ok: false; reason: 'email_in_use' };

export type PasswordResult =
  | { ok: true }
  | { ok: false; reason: 'invalid'; errors: Record<string, string> }
  | { ok: false; reason: 'wrong_current' }   // R6
  | { ok: false; reason: 'same_as_current' }; // R9

export async function updateProfile(input: {
  user: AppUser;
  raw: unknown;
}): Promise<ProfileResult>;

export async function changePassword(input: {
  user: AppUser;
  currentSessionId: string;
  raw: unknown;
}): Promise<PasswordResult>;
```

### Ruta `(app)/perfil`

| Archivo | Propósito |
|---|---|
| `src/routes/(app)/perfil/+page.server.ts` (nuevo) | `load`: `requireUser(locals)` (R1), devuelve `{ name, email, role }` de `locals.user` (R2, R12). `actions.perfil`: `requireUser` → `updateProfile` (R3, R4, R5) → mapear resultado a `fail`/`{ ok }`. `actions.password`: `requireUser` → leer `currentSessionId = getSessionIdFromCookies(cookies)` → `changePassword` (R6–R11) → mapear a `fail`/`{ ok }` |
| `src/routes/(app)/perfil/+page.svelte` (nuevo) | UI branded `--sys-*`, mobile-first: sección «Tus datos» (inputs name/email, rol como texto no editable), sección «Cambiar contraseña» (actual, nueva, confirmación). `use:enhance` en ambos forms; toast de éxito/error (#38) según `form?.ok` / `form?.error`. Tras editar datos OK, `invalidateAll()` para refrescar `locals.user` (R13) |

**Decisión:** dos **form actions** en una sola ruta (`?/perfil`, `?/password`) en vez de
endpoints `+server.ts` separados — reusa el patrón de #15/#47 y de `login/+page.server.ts`
(progressive enhancement, `use:enhance`, `fail` con errores por caso). El `currentSessionId` se
obtiene de la cookie con `getSessionIdFromCookies(cookies)` para preservar la sesión activa en la
invalidación (R11).

### UI / toast (reuso #38)

| Archivo | Propósito |
|---|---|
| `src/lib/components/form/SaveErrorToast.svelte` (reusar) o equivalente del patrón #38 | Mostrar éxito/error. Si el patrón #38 ya expone un toast de éxito, reusarlo; si solo hay error, extender mínimamente para el caso de éxito sin duplicar componente |

### Tests

| Archivo | Cubre |
|---|---|
| `tests/perfil-schema.test.ts` | R3 (schema sin `role`, `.strict`), R4 (name/email válidos e inválidos, longitudes), R7 (fortaleza: < 10, sin letra, sin dígito, > 200), R8 (confirmación distinta) |
| `tests/api/perfil.test.ts` | R1 (load sin user → redirect /login), R2 (load devuelve datos de locals.user), R3 (POST con `role` no cambia rol), R4 (edición válida persiste; inválida no), R5 (email de otro → rechazo; mismo email propio OK), R12 (POST con `userId` inyectado solo toca locals.user) |
| `tests/api/perfil-password.test.ts` | R6 (actual incorrecta → no cambia hash), R9 (nueva=actual → rechazo), R10 (éxito → hash cambia, verify nueva true / actual false), R11 (3 sesiones → queda solo la actual), R12 (guard de propiedad) |
| `e2e/perfil.spec.ts` | R1, R13, R15 (login → /perfil → cambiar contraseña → toast éxito → sigue navegando) |

Fixtures: usuario `tecnico` y `admin` sembrados (seed #2), helper para crear varias filas
`session` del mismo usuario (R11).

## Firmas principales

```typescript
// src/lib/server/db/users.ts
export async function updateUserProfile(
  id: string,
  data: { name: string; email: string }
): Promise<{ ok: true } | { ok: false; reason: 'email_in_use' }>; // 23505 → email_in_use
export async function updateUserPasswordHash(id: string, passwordHash: string): Promise<void>;

// src/lib/server/db/sessions.ts
export async function deleteOtherSessions(
  userId: string,
  keepSessionId: string
): Promise<void>; // DELETE FROM session WHERE user_id = $1 AND id <> $2
```

## Errores reutilizados / nuevos

- **Reusados:** `requireUser` (redirect 303 a `/login`, R1); `verifyPassword`/`hashPassword`
  (argon2id, R6/R10); `fail()` de SvelteKit con errores por caso; toast de #38.
- **Nuevos:** ninguna clase de error de dominio. Los casos se modelan como variantes
  discriminadas de `ProfileResult`/`PasswordResult` (`wrong_current`, `same_as_current`,
  `email_in_use`, `invalid`) mapeadas a `fail(400/409, { error, field })`. La colisión de email
  se detecta por código Postgres `23505` (UNIQUE de `app_user.email`) o por `findUserByEmailExcept`
  previo. No se exponen stack traces; logueo server-side.

## Alternativas descartadas

| Alternativa | Motivo descarte |
|---|---|
| Agregar columna `display_name` nueva (migración) | `app_user.name` ya cumple. Agregar columna sin necesidad viola «migración solo si hace falta». Queda como Open question si la puerta separa nombre legal/visible |
| Invalidar **todas** las sesiones (incluida la actual) y reloguear | Peor UX y el acceptance pide explícitamente conservar la sesión actual. `deleteOtherSessions(userId, keepCurrent)` cumple el requisito literal |
| Pasar el `userId` objetivo por la URL (`/perfil/[id]`) | Abre la puerta a editar a otros; exige guard extra. Derivar de `locals.user` elimina la clase de bug por construcción (R12) |
| Endpoint `+server.ts` JSON propio para cada operación | El form action reusa enhance, validación y `fail` por caso del patrón del repo; funciona sin JS |
| Reusar el reset de admin de #4 para el self-service | El reset de #4 no pide contraseña actual ni preserva sesión; semántica distinta. El cambio autenticado es su propio flujo |
| Verificar email nuevo por correo (doble opt-in) | Fuera de alcance MVP; suma complejidad de tokens (territorio de #50). Email se actualiza directo, validado por formato + unicidad. Open question |
| Política de fortaleza con caracteres especiales obligatorios | Fricción alta para staff interno; mín 10 + letra + dígito es un piso razonable. Open question por si la puerta endurece |

## Open questions (puerta humana)

1. **Columna nueva:** ¿alcanza `app_user.name` como nombre visible (propuesta: SÍ, sin migración)
   o se separa `display_name`?
2. **Política de fortaleza:** ¿mín 10 + letra + dígito (propuesta) o se endurece (símbolo
   obligatorio, mín 12, deny-list de comunes)?
3. **Email verificado:** ¿el cambio de email se aplica directo (propuesta) o requiere
   confirmación por correo?
4. **Toast de éxito:** ¿el patrón #38 ya expone un toast de éxito reusable, o se extiende el
   componente de error existente?
