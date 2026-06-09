# Design — #3 03_auth_roles

## Alcance

Capa de autenticación y autorización server-side para auditapp. Implementa login/logout, resolución de sesión en hooks, guards por rol y validación del token público de briefing. La UI completa del briefing y del backoffice quedan en features #4 y #5; aquí se entregan guards reutilizables, rutas mínimas de auth y carga server de `/briefing/[token]` con validación de token.

| Incluido | Excluido (otras features) |
|---|---|
| Login/logout, cookie, hooks | CRUD usuarios UI (#4) |
| Guards `admin` / `tecnico` / anónimo | Editor plantillas (#4) |
| Validación `public_token` + estados | Autosave briefing (#5) |
| Rate limit `/login` | Generación/regeneración token UI (#4) |
| Tests auth/guards | OAuth, MFA, magic-link (v2) |

## Dependencias

| Feature | Qué aporta |
|---|---|
| `01_stack_scaffolding` (#1) | SvelteKit, vitest, estructura `src/lib/server/auth/`, `.env.example` con `SESSION_SECRET` |
| `02_modelo_datos` (#2) | Tablas `app_user`, `session`, `audit.public_token`; seed admin + técnicos; máquina de estados `audit.status` |

### Decisión vigente: vigencia del token (PRD 07b)

El token de briefing **no expira por tiempo**. La validez la controla únicamente `audit.status ∈ {briefing_enviado, briefing_completo}`. Si `02_modelo_datos` aún incluye `token_expires_at` en la spec legacy 07a, **no se usa** en esta feature; la columna puede omitirse o ignorarse hasta alinear schema en #2.

## Modelo de permisos (v2 PRD)

| Acción | admin | tecnico | cliente (token) | anónimo |
|---|---|---|---|---|
| Login backoffice | ✅ | ✅ | ❌ | ❌ |
| Ver/listar todas las auditorías | ✅ | ✅ | ❌ | ❌ |
| Crear auditoría | ✅ | ✅ | ❌ | ❌ |
| Reabrir cerrada | ✅ | ❌ | ❌ | ❌ |
| Gestionar usuarios | ✅ | ❌ | ❌ | ❌ |
| Editar plantillas | ✅ | ❌ | ❌ | ❌ |
| Completar briefing | ✅ | ✅ | ✅ (su auditoría) | ❌ |
| Acceder `/briefing/[token]` | — | — | ✅ si token válido | ❌ |

Los guards se implementan server-side en load/actions; el UI solo refleja permisos, nunca los define.

## Archivos a crear/modificar

### Módulo auth (`src/lib/server/auth/`)

| Archivo | Propósito |
|---|---|
| `types.ts` | Tipos `UserRole`, `AppUser`, `SessionRow`, `BriefingAuditContext` |
| `password.ts` | Hash y verify argon2id |
| `session.ts` | CRUD sesión: create, resolve, destroy, renewSliding |
| `login.ts` | Orquestación authenticate(email, password) |
| `guards.ts` | `requireUser`, `requireStaff`, `requireAdmin`, helpers 403/redirect |
| `briefing-token.ts` | `resolveBriefingByToken`, `isBriefingStatusValid` |
| `rate-limit.ts` | Contador in-memory por IP para `/login` |
| `index.ts` | Re-exports públicos |

### Hooks y rutas

| Archivo | Propósito |
|---|---|
| `src/hooks.server.ts` | Resolver sesión → `event.locals.user`; renovación sliding |
| `src/app.d.ts` | Declarar `App.Locals.user: AppUser \| null` |
| `src/routes/login/+page.svelte` | Formulario email + password |
| `src/routes/login/+page.server.ts` | Action login + rate limit + redirect post-login |
| `src/routes/logout/+server.ts` | POST/GET logout, borra sesión |
| `src/routes/(app)/+layout.server.ts` | `requireStaff` — redirect anónimos a `/login` |
| `src/routes/briefing/[token]/+page.server.ts` | Load: validar token y estado; error amable |
| `src/routes/briefing/[token]/+page.svelte` | Placeholder mínimo (token OK vs enlace no disponible) |

### Queries DB (`src/lib/server/db/`)

| Archivo | Propósito |
|---|---|
| `users.ts` | `findUserByEmail`, `findUserById` |
| `sessions.ts` | `insertSession`, `findSessionById`, `deleteSession`, `touchSessionExpiry` |
| `audits.ts` | `findAuditByPublicToken` (stub mínimo para validación token) |

### Tests

| Archivo | Cubre |
|---|---|
| `tests/auth/password.test.ts` | R1 |
| `tests/auth/session.test.ts` | R2, R5, R6, R7 |
| `tests/auth/login.test.ts` | R2, R3, R8, R9, R17 |
| `tests/auth/guards.test.ts` | R10, R11, R12 |
| `tests/auth/briefing-token.test.ts` | R13, R14, R15, R16 |
| `tests/auth/logging.test.ts` | R18 |

Tests de integración usan DB de test o transacciones con seed de `02_modelo_datos`; no mocks de SQL en guards críticos.

## Firmas

### `src/lib/server/auth/types.ts`

```typescript
export type UserRole = 'admin' | 'tecnico';

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
};

export type BriefingAuditContext = {
  auditId: string;
  clientId: string;
  status: 'briefing_enviado' | 'briefing_completo';
  publicToken: string;
};
```

### `src/lib/server/auth/password.ts`

```typescript
/** Hash argon2id para persistir en app_user.password_hash. */
export async function hashPassword(plain: string): Promise<string>;

/** Compara plain contra hash almacenado; timing-safe vía librería. */
export async function verifyPassword(plain: string, hash: string): Promise<boolean>;
```

Dependencia: `@node-rs/argon2` (preferido) o `argon2`. Sin bcrypt salvo fallback documentado en alternativa descartada.

### `src/lib/server/auth/session.ts`

```typescript
const SESSION_COOKIE = 'session';
const SESSION_TTL_DAYS = 30;
const SLIDING_RENEW_THRESHOLD_DAYS = 15;

/** Genera id criptográfico (~32 bytes base64url) e inserta fila session. */
export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }>;

/** Busca session + app_user activo; null si expirada o inexistente. */
export async function resolveSession(sessionId: string): Promise<AppUser | null>;

/** Extiende expires_at si quedan <15 días. Retorna nueva fecha o null si no aplica. */
export async function renewSessionIfNeeded(sessionId: string): Promise<Date | null>;

/** Borra fila session por id. */
export async function destroySession(sessionId: string): Promise<void>;

export function setSessionCookie(cookies: Cookies, sessionId: string): void;
export function clearSessionCookie(cookies: Cookies): void;
export function getSessionIdFromCookies(cookies: Cookies): string | undefined;
```

### `src/lib/server/auth/login.ts`

```typescript
export type LoginResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: 'invalid_credentials' | 'inactive' };

/** Valida credenciales; mensaje al cliente siempre genérico vía reason. */
export async function authenticate(email: string, password: string): Promise<LoginResult>;
```

### `src/lib/server/auth/guards.ts`

```typescript
export class AuthError extends Error {
  readonly code: 'UNAUTHORIZED' | 'FORBIDDEN';
  readonly status: 401 | 403;
}

/** Lanza redirect 303 a /login si no hay user. */
export function requireUser(locals: App.Locals): AppUser;

/** admin o tecnico. */
export function requireStaff(locals: App.Locals): AppUser;

/** Solo admin; 403 para tecnico. */
export function requireAdmin(locals: App.Locals): AppUser;

/** Lista de acciones admin-only para tests y documentación. */
export const ADMIN_ONLY_ACTIONS = [
  'reopen_audit',
  'manage_users',
  'edit_templates'
] as const;

export type AdminOnlyAction = (typeof ADMIN_ONLY_ACTIONS)[number];

export function assertAdminOnly(locals: App.Locals, action: AdminOnlyAction): void;
```

### `src/lib/server/auth/briefing-token.ts`

```typescript
export type BriefingTokenResult =
  | { ok: true; audit: BriefingAuditContext }
  | { ok: false; reason: 'not_found' | 'invalid_status' };

const BRIEFING_VALID_STATUSES = ['briefing_enviado', 'briefing_completo'] as const;

export function isBriefingStatusValid(status: string): status is typeof BRIEFING_VALID_STATUSES[number];

export async function resolveBriefingByToken(token: string): Promise<BriefingTokenResult>;
```

### `src/lib/server/auth/rate-limit.ts`

```typescript
/** Incrementa contador; retorna true si debe bloquearse (≥5 en 60s). */
export function isLoginRateLimited(clientIp: string): boolean;
```

Implementación v1: `Map<string, { count: number; windowStart: number }>` en memoria del proceso. Suficiente para instancia única en Dokploy; documentar limitación multi-réplica.

### `src/hooks.server.ts`

```typescript
export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = getSessionIdFromCookies(event.cookies);
  if (sessionId) {
    event.locals.user = await resolveSession(sessionId);
    if (event.locals.user) {
      await renewSessionIfNeeded(sessionId);
    }
  } else {
    event.locals.user = null;
  }
  return resolve(event);
};
```

## Flujos

### Login

```
POST /login (email, password)
  → rate limit check (429 si excede)
  → authenticate → createSession
  → Set-Cookie session=… HttpOnly; Secure; SameSite=Lax
  → redirect 303 → / (o tablero stub en (app)/)
```

### Logout

```
POST /logout
  → destroySession(id from cookie)
  → clearSessionCookie
  → redirect /login
```

### Briefing token

```
GET /briefing/[token]
  → resolveBriefingByToken(token)
  → ok: load mínimo con audit context (UI placeholder)
  → not_found | invalid_status: página «Este enlace ya no está disponible»
  → sin redirect a /login
```

## Errores

| Situación | Comportamiento |
|---|---|
| Credenciales inválidas | 200/400 form action con mensaje genérico R8 |
| Rate limit | HTTP 429, mensaje «Demasiados intentos. Probá de nuevo en un minuto.» |
| Sin sesión en `(app)/` | Redirect 303 `/login` |
| Técnico en acción admin-only | HTTP 403, mensaje «No tenés permiso para esta acción» |
| Token briefing inválido | UI amable, sin datos de auditoría ni stack trace |
| Sesión expirada | `locals.user = null`, tratar como anónimo |
| Error DB en resolve session | Log server-side; `locals.user = null` (fail closed para auth interna) |

Clases reutilizables: `AuthError` (guards). No exponer stack traces al cliente.

## Variables de entorno

Reutiliza `SESSION_SECRET` de `.env.example` (`01_stack_scaffolding` #1) para firmar cookies opcionales futuras; la cookie de sesión v1 usa el `session.id` opaco de DB, no JWT.

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Queries session/user/audit |
| `SESSION_SECRET` | Reservado; validar presencia al arranque |
| `NODE_ENV` | `Secure` cookie siempre true en prod; en dev local puede requerir HTTPS o flag documentado |

## Alternativa descartada: bcrypt como primario

**Descartado:** usar bcrypt cost ≥12 en lugar de argon2id.

**Motivo:** PRD y `docs/architecture.md` fijan argon2id. bcrypt queda solo como fallback de emergencia si el binding nativo falla en Docker — debe documentarse en `progress/` y alinear con Martín antes de usar.

## Alternativa descartada: JWT en cookie

**Descartado:** sesión stateless con JWT firmado.

**Motivo:** SPEC-07b exige fila en `session` con invalidación server-side en logout. JWT dificulta revocación inmediata sin denylist adicional.

## Alternativa descartada: OAuth / Auth0

**Descartado:** proveedor externo de identidad.

**Motivo:** App interna, equipo pequeño, sin presupuesto SSO. Auth propia es más simple y cumple requisitos SyS.

## Alternativa descartada: expiración temporal del token de briefing

**Descartado:** invalidar por `token_expires_at`.

**Motivo:** Decisión cerrada en PRD 07b — el cliente puede volver mientras la auditoría no avance de estado; el admin regenera token manualmente al reagendar.

## Alternativa descartada: restricción técnico solo auditorías asignadas

**Descartado:** técnico ve solo `assigned_tech_id = self`.

**Motivo:** Cambio v2 PRD — técnicos ven todas las auditorías y pueden crear. Guards server-side facilitan endurecer después sin cambiar UI.

## Notas para implementer

- Validar email/password con Zod en action de login antes de tocar DB.
- Cookie path `/`, max-age alineado a 30 días.
- `(app)/+layout.server.ts` es el punto único de guard para rutas internas en esta feature; rutas admin-only específicas añaden `requireAdmin` cuando existan en #4.
- `/briefing/[token]` NO debe pasar por `requireStaff`.
- Documentar trazabilidad R→test en `progress/impl_03_auth_roles.md`.
- Ejecutar `./init.sh` verde antes de marcar `done`.
