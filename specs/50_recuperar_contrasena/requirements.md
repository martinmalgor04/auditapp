# Requirements — #50 50_recuperar_contrasena

> Flujo público «olvidé mi contraseña» por email para usuarios de la app (admin/técnico).
> Se apoya en el servicio de email #49 (`sendEmail` + plantilla reservada `password_reset`) y en
> el auth #3 (`password.ts` argon2id, `session.ts`, `rate-limit.ts`, patrón de token). Comparte la
> política de fortaleza de contraseña con #48 y la invalidación de sesiones.
>
> Dos rutas públicas (sin auth):
> - `GET/POST /forgot` — el usuario ingresa su email; respuesta **siempre neutra** (no revela si el
>   email existe). Si existe usuario activo, se genera un token de un solo uso y se envía el mail.
> - `GET/POST /reset/[token]` — valida token vigente y permite fijar nueva contraseña.
>
> **Decisiones de puerta (Martín, 2026-06-25 — RESUELTAS):**
> 1. **Expiración del token: 60 min.** Constante `PASSWORD_RESET_TTL_MIN = 60`.
> 2. **Política de fortaleza: la misma de #48** — mínima, solo largo `>= 8` (máx. 200), sin reglas
>    de composición. Fuente de verdad única en `src/lib/server/auth/password-policy.ts` (compartido
>    con #48, NO se duplica).
> 3. **Rate limit:** reusar el patrón in-memory por IP de `rate-limit.ts` (5/min por ventana de 60s)
>    generalizándolo para `/forgot` y `/reset`, sin tabla nueva.
>
> Depende de (todas `done` o spec_ready aguas arriba):
> - `49_servicio_email` (#49) — contrato `sendEmail(template, to, data)`, plantilla **reservada**
>   `password_reset` con datos `{ nombre, resetUrl, expiraEnMin }`, tabla `email_log`, dry-run.
> - `03_auth_roles` (#3) — `hashPassword`/`verifyPassword` (`password.ts`), cookie/sesión
>   (`session.ts`), `rate-limit.ts`, patrón de token (briefing `public_token`, sesión `randomBytes`).
> - `48_perfil_usuario` (#48) — política de fortaleza Zod (`passwordChangeSchema`/`strongPassword`),
>   `deleteOtherSessions`; acá se necesita invalidar **todas** las sesiones del usuario.
> - `02_modelo_datos` (#2) — runner `runMigrations`, tablas `app_user`, `session`, cliente postgres.js.
> - `11_ui_branding_sys` (#11) — tokens SyS para las pantallas y el HTML del mail. `38` — toasts.
>
> **Fuera de alcance:** cambio de contraseña autenticado (eso es #48); ABM/reset por admin (#4);
> verificación de email; 2FA; envío del mail por SaaS (el transporte es #49).

## Política de fortaleza de contraseña (compartida con #48 — decisión de puerta)

| Regla | Validación Zod |
|---|---|
| Longitud mínima 8 caracteres | `z.string().min(8)` |
| Longitud máxima 200 caracteres | `.max(200)` |
| Nueva + confirmación coinciden | `.refine` cruzado |

## R1 — `GET /forgot` rinde el formulario de solicitud sin auth

CUANDO un visitante (con o sin sesión) abre `GET /forgot`, el sistema DEBE renderizar el
formulario de solicitud de recuperación (un campo email) con branding SyS, sin requerir
autenticación y sin redirigir a `/login`.

**Verificación:** `e2e/recuperar-contrasena.spec.ts` — `GET /forgot` responde 200 con el campo
email visible, sin sesión.

## R2 — `POST /forgot` responde siempre de forma neutra

CUANDO un visitante envía un email por `POST /forgot` (exista o no un usuario con ese email), el
sistema DEBE responder con el **mismo mensaje neutro** («Si el email corresponde a una cuenta, te
enviamos un enlace para restablecer la contraseña») y el mismo código de estado, sin revelar la
existencia de la cuenta.

**Verificación:** `tests/api/forgot.test.ts` — `POST /forgot` con un email existente y con un email
inexistente producen idéntico mensaje y status; el cuerpo de la respuesta no difiere en función de
la existencia del usuario.

## R3 — Email inválido no filtra información

SI el email enviado a `POST /forgot` no tiene formato válido (Zod) ENTONCES el sistema DEBE
rechazar el envío con un error de validación de formato, sin generar token ni enviar correo, y sin
revelar si la cuenta existe.

**Verificación:** `tests/forgot-schema.test.ts` — `forgotSchema` rechaza emails mal formados y
acepta uno válido; `tests/api/forgot.test.ts` — un email malformado no inserta fila en
`password_reset_token` ni invoca `sendEmail`.

## R4 — Solicitud válida genera token de un solo uso hasheado en DB

CUANDO `POST /forgot` recibe un email que corresponde a un usuario **activo**, el sistema DEBE
generar un token aleatorio criptográfico (≥32 bytes, base64url, patrón `session.ts`), persistir en
`password_reset_token` **solo su hash** (SHA-256) junto al `user_id`, `expires_at`
(now + `PASSWORD_RESET_TTL_MIN`) y `used_at` NULL; el token en claro NO DEBE almacenarse y solo
viaja en el link del email.

**Verificación:** `tests/api/forgot.test.ts` — tras un `POST /forgot` con email de usuario activo,
existe una fila en `password_reset_token` con `token_hash` (no el token en claro), `expires_at`
futuro y `used_at` NULL; el valor en claro no aparece en ninguna columna.

## R5 — Usuario inactivo o inexistente no genera token ni envía correo

SI el email de `POST /forgot` no corresponde a ningún usuario, o corresponde a uno con
`active = false`, ENTONCES el sistema DEBE NO generar token ni enviar correo, manteniendo la
respuesta neutra de R2.

**Verificación:** `tests/api/forgot.test.ts` — un email inexistente y un usuario inactivo no
insertan fila en `password_reset_token` ni invocan `sendEmail`, pero la respuesta es la neutra.

## R6 — Pedir un token nuevo invalida los anteriores del usuario

CUANDO un usuario solicita un nuevo reseteo y ya tenía tokens de reseteo vigentes, el sistema DEBE
invalidar todos los tokens previos no usados de ese usuario (marcarlos consumidos/expirados) antes
o al crear el nuevo, de modo que solo el último quede utilizable.

**Verificación:** `tests/api/forgot.test.ts` — dos `POST /forgot` consecutivos para el mismo
usuario dejan a lo sumo un token utilizable; usar el primer token tras el segundo pedido falla con
token inválido (R10).

## R7 — Email branded SyS con link `/reset/[token]` vía servicio #49

CUANDO se genera un token válido, el sistema DEBE enviar el correo mediante
`sendEmail('password_reset', email, { nombre, resetUrl, expiraEnMin })` del servicio #49, donde
`resetUrl` es la URL absoluta `${PUBLIC_APP_URL}/reset/<token-en-claro>` y `expiraEnMin` es
`PASSWORD_RESET_TTL_MIN`; el envío DEBE quedar registrado en `email_log` (vía #49).

**Verificación:** `tests/api/forgot.test.ts` — con un usuario activo, `sendEmail` se invoca con
`'password_reset'`, el email del usuario y un `resetUrl` que contiene el token en claro y apunta a
`/reset/`; el resultado del envío produce una fila en `email_log` (mock/dry-run de #49).

## R8 — Cuerpo de la plantilla `password_reset`

El sistema DEBE definir el render de la plantilla reservada `password_reset` de #49 (HTML branded
SyS + texto plano) con: saludo a `nombre`, explicación de que se pidió restablecer la contraseña,
botón/enlace a `resetUrl`, aviso de expiración (`expiraEnMin` minutos) y nota de que si no lo
solicitó puede ignorar el correo; validando `data` con el schema declarado en #49.

**Verificación:** `tests/email-templates.test.ts` (extendido) — `EMAIL_TEMPLATES.password_reset`
con datos válidos produce HTML (con tokens SyS) y texto plano no vacíos que incluyen `resetUrl` y
`expiraEnMin`; con datos inválidos `sendEmail` devuelve `fallido` sin tocar el transporte.

## R9 — `GET /reset/[token]` con token vigente rinde el formulario de nueva contraseña

CUANDO un visitante abre `GET /reset/[token]` con un token cuyo hash existe en
`password_reset_token`, no está usado (`used_at` NULL) y no está expirado (`expires_at` futuro), el
sistema DEBE renderizar el formulario de nueva contraseña (nueva + confirmación) con branding SyS,
sin auth.

**Verificación:** `e2e/recuperar-contrasena.spec.ts` / `tests/api/reset.test.ts` — `GET
/reset/[token]` con token vigente responde 200 con los campos de nueva contraseña; el token en
claro no se refleja en el HTML salvo donde es necesario para el submit.

## R10 — Token inválido o expirado muestra pantalla amable

SI el token de `/reset/[token]` no existe, ya fue usado (`used_at` no NULL) o está expirado
ENTONCES el sistema DEBE mostrar una pantalla amable branded SyS que explique que el enlace ya no
es válido y ofrezca volver a `/forgot`, sin revelar a qué usuario pertenecía ni permitir el cambio.

**Verificación:** `tests/api/reset.test.ts` — un token inexistente, uno expirado (mockeando
`expires_at` pasado) y uno con `used_at` seteado no rinden el formulario y producen el mensaje
amable; ningún `POST` posterior sobre ellos cambia la contraseña.

## R11 — `POST /reset/[token]` valida la nueva contraseña con la política de fortaleza

CUANDO un visitante envía la nueva contraseña por `POST /reset/[token]`, el sistema DEBE validar
con el schema Zod de fortaleza compartido con #48 (`password-policy.ts`: mín. 8, máx. 200, sin
reglas de composición) y la coincidencia con la confirmación; SI no cumple ENTONCES el sistema DEBE
rechazar el cambio con error de política y NO DEBE consumir el token ni modificar el hash.

**Verificación:** `tests/reset-schema.test.ts` — el schema rechaza contraseñas cortas (<8), sin
>200 y confirmación que no coincide, y acepta una válida; `tests/api/reset.test.ts`
— un `POST` con contraseña débil no actualiza `password_hash` ni marca el token usado.

## R12 — Reseteo exitoso fija la nueva contraseña con argon2id

CUANDO `POST /reset/[token]` recibe un token vigente y una contraseña que cumple la política, el
sistema DEBE hashear la nueva contraseña con `hashPassword` (argon2id, reusando `password.ts`) y
actualizar `app_user.password_hash` del usuario dueño del token.

**Verificación:** `tests/api/reset.test.ts` — tras el reseteo, `verifyPassword(nueva, password_hash)`
es true y el hash anterior dejó de validar; el hash persistido tiene formato argon2id.

## R13 — Reseteo exitoso consume el token (un solo uso)

CUANDO un reseteo se completa con éxito, el sistema DEBE marcar el token como usado
(`used_at = now()`) de modo que un segundo `POST /reset/[token]` con el mismo token falle con token
inválido (R10).

**Verificación:** `tests/api/reset.test.ts` — un segundo `POST` con el mismo token tras un reseteo
exitoso no cambia la contraseña y devuelve la pantalla amable; la fila tiene `used_at` no NULL.

## R14 — Reseteo exitoso invalida todas las sesiones del usuario

CUANDO un reseteo se completa con éxito, el sistema DEBE eliminar **todas** las sesiones del
usuario dueño del token (`DELETE FROM session WHERE user_id = $1`), de modo que cualquier sesión
abierta quede invalidada.

**Verificación:** `tests/api/reset.test.ts` — tras el reseteo, las filas `session` del usuario no
existen y una request con la cookie de sesión previa ya no resuelve usuario.

## R15 — Atomicidad del reseteo

El sistema DEBE ejecutar el update de `password_hash`, el consumo del token (`used_at`) y la
invalidación de sesiones (R12–R14) en una transacción, de modo que un fallo no deje el token
consumido sin haber cambiado la contraseña ni viceversa.

**Verificación:** `tests/api/reset.test.ts` — forzar un error en la invalidación de sesiones deja
intactos `password_hash` y `used_at` (el reseteo no quedó a medias).

## R16 — Rate limit en `/forgot` y `/reset`

El sistema DEBE aplicar rate limit por IP en `POST /forgot` y `POST /reset/[token]` reusando el
patrón de `rate-limit.ts` (≤5 intentos por ventana de 60s); SI se supera ENTONCES el sistema DEBE
responder con error de demasiados intentos (y `/forgot` mantiene la neutralidad de R2).

**Verificación:** `tests/passwordreset-rate-limit.test.ts` — el 6.º `POST` dentro de la ventana
desde la misma IP es rechazado por rate limit en ambas rutas; `/forgot` rate-limitado no revela
existencia de usuario.

## R17 — Migración SQL idempotente crea `password_reset_token`

El sistema DEBE incluir la migración `0NN_recuperar_contrasena.sql` (0NN = siguiente número
disponible al implementar; **va después** de la migración de #49 `0NN_servicio_email.sql`) que crea
`password_reset_token` con `CREATE TABLE IF NOT EXISTS` e índices `IF NOT EXISTS`, re-ejecutable sin
error.

**Verificación:** `tests/passwordreset-schema.test.ts` — aplicar la migración dos veces no falla; la
tabla `password_reset_token` existe con las columnas e índices declarados en design §Schema.

## R18 — Tests unitarios, integración y e2e

El sistema DEBE incluir tests vitest y un e2e que cubran: respuesta neutra (R2), validación de
email (R3), generación/hash/un-solo-uso/expiración del token (R4, R6, R10, R13), política de
contraseña (R11), reseteo argon2id (R12), invalidación de sesiones (R14), atomicidad (R15), rate
limit (R16), migración idempotente (R17), y el flujo e2e forgot → mail (dry-run #49) → reset →
login con la nueva contraseña.

**Verificación:** `pnpm test` y `pnpm exec playwright test e2e/recuperar-contrasena.spec.ts` pasan
sin SMTP real (servicio #49 en dry-run / mockeado).

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #50) | Requirements |
|---|---|
| `/forgot` acepta email y responde siempre neutra (no revela existencia) | R1, R2, R3, R5 |
| Token de un solo uso hasheado con expiración corta; pedir uno nuevo invalida el anterior | R4, R6, R13 |
| Email branded SyS con link `/reset/[token]` vía #49 (en `email_log`) | R7, R8 |
| `/reset/[token]` valida token vigente, exige nueva contraseña Zod (argon2id) y confirma | R9, R11, R12 |
| Al resetear: token consumido e invalidado y todas las sesiones invalidadas | R13, R14, R15 |
| Rate limit en `/forgot` y `/reset`; pantallas amables para token inválido/expirado | R10, R16 |
| Migración SQL idempotente para `password_reset_token` | R17 |
| Tests: neutra, expiración/un-solo-uso, política, invalidación de sesiones, rate limit, e2e | R18 |

## Fuera de alcance (no implementar)

- Cambio de contraseña autenticado (#48) y reset por admin (#4).
- Transporte SMTP / proveedor de email (eso es #49; acá solo se consume `sendEmail`).
- Verificación de email por correo, 2FA, listado de dispositivos.
- Cola persistente de envíos / rate limit distribuido (el rate limit es in-memory, como #3).
