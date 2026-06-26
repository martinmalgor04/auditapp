# Requirements — #48 48_perfil_usuario

> Perfil de usuario propio + cambio de contraseña autenticado. Cualquier usuario autenticado
> (admin o técnico) edita **sus propios** datos editables (nombre visible, email) y cambia su
> contraseña sin depender del admin. El rol NO es autoeditable. El cambio de contraseña exige
> la contraseña actual (verificación argon2id reusando `password.ts`), nueva + confirmación, con
> política de fortaleza validada con Zod, e invalida las demás sesiones del usuario salvo la
> actual (reusa `session.ts`). UI branded SyS (#11), toasts (#38), mobile-first.
>
> **Fuera de alcance:** recuperación de contraseña por mail (eso es #50); ABM de otros usuarios
> y reset por admin (eso es #4). Esta feature solo toca el perfil del usuario logueado.
>
> Depende de (todas `done`/disponibles): `03_auth_roles` (#3) — `password.ts`
> (`hashPassword`/`verifyPassword` argon2id), `session.ts` (`destroySession`, cookie de sesión,
> `SESSION_COOKIE`, `getSessionIdFromCookies`), `guards.ts` (`requireUser`/`requireStaff`),
> tabla `app_user` (columnas `id`, `email`, `name`, `role`, `active`, `password_hash`) y tabla
> `session` (`id`, `user_id`, `expires_at`); `04_backoffice` (#4) — shell `(app)` autenticado;
> `11_ui_branding_sys` (#11) — tokens `--sys-*`, Montserrat; `#38` — patrón de toast de
> éxito/error. NO toca el motor de scoring, auditorías, ni la generación/entrega de informes.

## Decisión de columna nueva (migración)

La tabla `app_user` **ya tiene** columna `name`, que cumple la función de «nombre visible». Por
lo tanto **no hace falta columna nueva** y la migración es **opcional / no requerida** para esta
feature. Si durante la implementación se confirmara que `name` es insuficiente (p.ej. se quiere
separar `display_name` de un nombre legal), recién entonces se agregaría la migración idempotente
`0NN_perfil_display_name.sql` (0NN = siguiente número disponible al implementar; ya existe `025_`,
con lo cual sería `026_`). Ver design §Cambios de schema y §Open questions (decisión de puerta).

## Política de fortaleza de contraseña (propuesta — decisión de puerta, ver design §Open questions)

| Regla | Validación Zod |
|---|---|
| Longitud mínima 10 caracteres | `z.string().min(10)` |
| Longitud máxima 200 caracteres (evita DoS de hashing) | `z.string().max(200)` |
| Al menos una letra y al menos un dígito | `.refine(/[A-Za-z]/ ... && /[0-9]/ ...)` |
| Nueva ≠ contraseña actual | `.refine` cruzado en el schema de cambio |
| Confirmación coincide con la nueva | `.refine` cruzado (`nueva === confirmacion`) |

## R1 — Ruta de perfil protegida, solo accesible autenticado

CUANDO un usuario sin sesión intenta abrir `GET /(app)/perfil`, el sistema DEBE redirigir a
`/login` (patrón `requireUser`), sin renderizar datos de perfil.

**Verificación:** `e2e/perfil.spec.ts` — abrir `/perfil` sin sesión redirige a `/login`;
`tests/api/perfil.test.ts` — el `load` sin `locals.user` produce redirect 303 a `/login`.

## R2 — El perfil muestra los datos propios del usuario autenticado

CUANDO un usuario autenticado (admin o técnico) abre `GET /(app)/perfil`, el sistema DEBE
renderizar **sus propios** datos editables (nombre visible y email) y su rol en modo solo
lectura, tomando la identidad de `locals.user` (nunca de un id en la URL o el query).

**Verificación:** `e2e/perfil.spec.ts` — un usuario logueado ve su nombre y email en los campos
del formulario y su rol como texto no editable; `tests/api/perfil.test.ts` — el `load` devuelve
`{ name, email, role }` de `locals.user` y no acepta ningún parámetro de id.

## R3 — El rol NO es autoeditable desde el perfil

CUANDO un usuario envía la edición de su perfil, el sistema DEBE ignorar cualquier campo `role`
recibido en el form y NO DEBE modificar `app_user.role` del usuario.

**Verificación:** `tests/api/perfil.test.ts` — un POST de edición que incluye `role=admin` desde
un usuario `tecnico` no cambia su rol en `app_user` (sigue `tecnico`); el schema Zod de edición
no contiene el campo `role` (`.strict` rechaza el campo extra o lo descarta de forma explícita).

## R4 — Edición de datos propios validada con Zod y persistida

CUANDO un usuario autenticado envía la edición de su perfil con datos válidos (nombre visible no
vacío ≤ 120 chars, email con formato válido ≤ 200 chars), el sistema DEBE validar el payload con
un schema Zod estricto (`profileUpdateSchema`) y persistir `name` y `email` **solo del usuario
de `locals.user`**; SI el payload es inválido ENTONCES el sistema DEBE responder con error de
validación claro por caso sin modificar la fila.

**Verificación:** `tests/perfil-schema.test.ts` — `profileUpdateSchema` acepta el payload válido
y rechaza nombre vacío, email mal formado, longitudes excedidas y campos extra (`.strict`);
`tests/api/perfil.test.ts` — POST válido actualiza `name`/`email` del usuario actual; POST
inválido no modifica la fila y devuelve error por campo.

## R5 — Email único: no permitir colisión con otro usuario

CUANDO un usuario cambia su email a uno ya usado por **otro** usuario, el sistema DEBE rechazar
el cambio con un error claro («Ese email ya está en uso») y NO DEBE modificar la fila.

**Verificación:** `tests/api/perfil.test.ts` — POST con un email que pertenece a otro `app_user`
no actualiza la fila y devuelve el error de email en uso; cambiar al **mismo** email propio (sin
cambio real) no falla.

## R6 — Cambio de contraseña exige la contraseña actual verificada con argon2id

CUANDO un usuario envía el cambio de contraseña, el sistema DEBE verificar la contraseña actual
contra `app_user.password_hash` con `verifyPassword` (argon2id, reusando `password.ts`); SI la
contraseña actual es incorrecta ENTONCES el sistema DEBE rechazar el cambio con error claro
(«La contraseña actual no es correcta») sin modificar el hash ni invalidar sesiones.

**Verificación:** `tests/api/perfil-password.test.ts` — cambio con contraseña actual incorrecta
no actualiza `password_hash` y devuelve el error; con contraseña actual correcta procede;
`tests/perfil-schema.test.ts` cubre la forma del payload.

## R7 — Nueva contraseña validada por política de fortaleza con Zod

CUANDO un usuario envía el cambio de contraseña, el sistema DEBE validar la nueva contraseña con
el schema Zod de política de fortaleza (`passwordChangeSchema`: mín. 10 chars, máx. 200, al menos
una letra y un dígito); SI no cumple la política ENTONCES el sistema DEBE rechazar el cambio con
error claro que indique el requisito incumplido, sin modificar el hash.

**Verificación:** `tests/perfil-schema.test.ts` — `passwordChangeSchema` rechaza contraseñas
cortas (< 10), sin dígito, sin letra, y > 200 chars, y acepta una contraseña que cumple;
`tests/api/perfil-password.test.ts` — POST con nueva débil no actualiza el hash.

## R8 — Nueva contraseña + confirmación deben coincidir

CUANDO un usuario envía el cambio de contraseña, el sistema DEBE exigir que la confirmación
coincida exactamente con la nueva contraseña; SI no coinciden ENTONCES el sistema DEBE rechazar
el cambio con error claro («La confirmación no coincide») sin modificar el hash.

**Verificación:** `tests/perfil-schema.test.ts` — `passwordChangeSchema` rechaza cuando
`nueva !== confirmacion`; `tests/api/perfil-password.test.ts` — POST con confirmación distinta
no actualiza el hash.

## R9 — La nueva contraseña debe diferir de la actual

CUANDO un usuario envía una nueva contraseña igual a la actual (la verificación de la actual fue
exitosa), el sistema DEBE rechazar el cambio con error claro («La nueva contraseña debe ser
distinta de la actual») sin reescribir el hash.

**Verificación:** `tests/api/perfil-password.test.ts` — cambio con `nueva === actual` (actual
correcta) no actualiza el hash y devuelve el error.

## R10 — Cambio exitoso: re-hash argon2id y persistencia

CUANDO el cambio de contraseña pasa todas las validaciones (R6–R9), el sistema DEBE hashear la
nueva contraseña con `hashPassword` (argon2id) y persistir el nuevo `password_hash` del usuario
de `locals.user`.

**Verificación:** `tests/api/perfil-password.test.ts` — tras un cambio exitoso, `password_hash`
cambia, `verifyPassword(nueva, hashNuevo)` es `true` y `verifyPassword(actual, hashNuevo)` es
`false`.

## R11 — Al cambiar la contraseña, invalidar las demás sesiones salvo la actual

CUANDO el cambio de contraseña es exitoso (R10), el sistema DEBE eliminar todas las sesiones del
usuario en la tabla `session` **excepto** la sesión actual (la del request), de modo que la
sesión vigente del usuario siga válida y las demás queden invalidadas.

**Verificación:** `tests/api/perfil-password.test.ts` — con un usuario que tiene 3 sesiones, tras
el cambio queda exactamente la sesión actual en `session` y las otras 2 fueron borradas; la
cookie de sesión actual sigue resolviendo a un `AppUser` válido.

## R12 — Guard de propiedad: un usuario solo toca su propio perfil y contraseña

El sistema DEBE derivar el sujeto de toda operación de perfil (lectura, edición, cambio de
contraseña) **exclusivamente** de `locals.user` y NO DEBE aceptar un id de usuario objetivo
desde el cliente (URL, query o body); SI el cliente envía un `userId`/`id` ENTONCES el sistema
DEBE ignorarlo y operar sobre `locals.user`.

**Verificación:** `tests/api/perfil.test.ts` y `tests/api/perfil-password.test.ts` — un POST que
incluye `userId` de otro usuario modifica únicamente la fila de `locals.user` y nunca la del id
inyectado; no existe ningún parámetro de ruta de usuario en `/(app)/perfil`.

## R13 — Feedback con toast de éxito/error y branding SyS, mobile-first

CUANDO una operación de perfil (edición o cambio de contraseña) termina, el sistema DEBE mostrar
feedback al usuario con el patrón de toast de #38 (éxito o error) en una UI branded SyS (tokens
`--sys-*`, Montserrat) y mobile-first; los errores de validación DEBEN mostrarse por caso sin
exponer stack traces.

**Verificación:** `e2e/perfil.spec.ts` — un cambio de contraseña exitoso muestra el toast de
éxito branded; un cambio con contraseña actual incorrecta muestra el toast/mensaje de error
correspondiente; layout legible en viewport mobile.

## R14 — Tests unitarios e integración

El sistema DEBE incluir tests vitest en `tests/perfil-schema.test.ts`, `tests/api/perfil.test.ts`
y `tests/api/perfil-password.test.ts` que cubran la validación Zod (edición y política de
fortaleza), la verificación de contraseña actual (argon2id), la invalidación de sesiones, el
guard de propiedad y la unicidad de email, ejecutables sin servicios externos.

**Verificación:** `pnpm test` ejecuta la suite de perfil en verde.

## R15 — E2E del flujo de cambio de contraseña

El sistema DEBE incluir `e2e/perfil.spec.ts` que recorra: login → abrir `/perfil` → cambiar la
contraseña (actual + nueva + confirmación) → ver el toast de éxito → comprobar que se puede
seguir navegando con la sesión actual.

**Verificación:** `pnpm exec playwright test e2e/perfil.spec.ts` pasa en CI.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #48) | Requirements |
|---|---|
| Usuario autenticado accede a ruta protegida y ve sus datos; no edita su rol | R1, R2, R3 |
| Cambio de contraseña exige actual válida (argon2id), nueva + confirmación coincidentes y política Zod; errores por caso | R6, R7, R8, R9, R10 |
| Al cambiar la contraseña se invalidan las otras sesiones; la actual sigue válida | R11 |
| Edición de datos propios (nombre/email) persistida y validada con Zod; rol inmutable | R3, R4, R5 |
| Guard server-side: un usuario no puede editar perfil ni contraseña de otro | R12 |
| UI branded SyS con toast de éxito/error (#38), mobile-first | R13 |
| Tests: verificación de actual, política de fortaleza, invalidación de sesiones, guard de propiedad, e2e | R6, R7, R11, R12, R14, R15 |

## Fuera de alcance (no implementar)

- Recuperación de contraseña por mail / token de reset (eso es #50).
- ABM de otros usuarios y reset de contraseña por admin (eso es #4).
- Cambio de email con verificación por correo (doble opt-in) — el email se actualiza directo,
  validado por formato y unicidad. Open question por si la puerta lo quiere verificado.
- 2FA / MFA.
- Cierre de sesión remoto selectivo (gestión de sesiones con listado de dispositivos).
