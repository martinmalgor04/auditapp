# Requirements — auth_roles

> Autenticación interna (admin/técnico), sesiones por cookie y acceso público del cliente por token.
> Milestone 2 de SPEC-07b. **Depende de:** `modelo_datos` (#2) — tablas `app_user`, `session`, columna `audit.public_token`.
> Fuera de alcance: UI completa de briefing (#5), backoffice (#4), OAuth/MFA/recovery por email.

## R1 — Hash de contraseñas con argon2id

El sistema DEBE almacenar y verificar contraseñas internas exclusivamente con hash argon2id en `app_user.password_hash`.

**Verificación:** test que hashea una contraseña y verifica con argon2; inspección de seed/fixtures confirma que no hay texto plano en DB.

## R2 — Creación de sesión al login exitoso

CUANDO un usuario interno envía credenciales válidas en POST `/login`, el sistema DEBE crear una fila en `session` con `id` aleatorio (~32 bytes), `user_id` y `expires_at` a 30 días desde el momento del login.

**Verificación:** test de integración POST `/login` con usuario seed; query a `session` confirma fila nueva.

## R3 — Cookie de sesión segura

CUANDO el login es exitoso, el sistema DEBE establecer la cookie `session` con el `id` de sesión, atributos `HttpOnly`, `Secure` y `SameSite=Lax`.

**Verificación:** test de respuesta HTTP inspecciona `Set-Cookie` con los tres atributos.

## R4 — Resolución de sesión en hooks

En cada request server-side, el sistema DEBE leer la cookie `session`, resolver `session → app_user` activo y asignar el resultado a `event.locals.user` (o `null` si no hay sesión válida).

**Verificación:** test que simula cookie válida/inválida y assert sobre `event.locals.user` tras ejecutar el hook.

## R5 — Expiración de sesión a 30 días

MIENTRAS una sesión existe, el sistema DEBE considerarla inválida si `expires_at` es anterior al instante actual.

**Verificación:** test con sesión cuya `expires_at` está en el pasado → `event.locals.user` es `null`.

## R6 — Renovación sliding de sesión

CUANDO una sesión válida tiene menos de 15 días restantes hasta `expires_at`, el sistema DEBE extender `expires_at` a 30 días desde el request actual.

**Verificación:** test con sesión a 10 días de vencer; tras un request autenticado, `expires_at` en DB se actualizó.

## R7 — Logout invalida sesión server-side

CUANDO un usuario autenticado ejecuta logout, el sistema DEBE borrar la fila `session` correspondiente y limpiar la cookie `session` del cliente.

**Verificación:** test POST logout → fila ausente en DB y cookie eliminada; request posterior con la misma cookie → `locals.user` null.

## R8 — Mensaje genérico en login fallido

SI las credenciales son inválidas (usuario inexistente, contraseña incorrecta o usuario inactivo), ENTONCES el sistema DEBE responder con el mensaje genérico «usuario o contraseña incorrectos» sin revelar cuál falló.

**Verificación:** tests con email inexistente y contraseña incorrecta; mismo mensaje en ambos casos.

## R9 — Rate limit en login

CUANDO una misma IP supera 5 intentos POST `/login` en una ventana de 60 segundos, el sistema DEBE rechazar intentos adicionales con HTTP 429 hasta que expire la ventana.

**Verificación:** test que envía 6 POST consecutivos desde la misma IP; el sexto retorna 429.

## R10 — Bloqueo de rutas internas a anónimos

CUANDO un request accede a rutas bajo `(app)/` sin sesión válida, el sistema DEBE redirigir a `/login` (o responder 401 en endpoints JSON).

**Verificación:** test GET a ruta protegida sin cookie → redirect 303 a `/login`.

## R11 — Guard de acciones sensibles solo admin

CUANDO un usuario con rol `tecnico` intenta una acción marcada como admin-only (reabrir auditoría cerrada, gestionar usuarios, editar plantillas), el sistema DEBE responder HTTP 403.

**Verificación:** tests de guards con usuario `tecnico` y `admin`; técnico recibe 403, admin pasa.

## R12 — Guard de staff para operaciones de auditoría

CUANDO un usuario con rol `admin` o `tecnico` autenticado accede a operaciones de listado/creación de auditorías, el sistema DEBE permitir el acceso.

**Verificación:** tests con fixtures `admin` y `tecnico`; ambos pasan guard `requireStaff` en rutas de auditoría.

## R13 — Validación de token de briefing por lookup

CUANDO un request llega a `/briefing/[token]`, el sistema DEBE resolver la auditoría por coincidencia exacta de `audit.public_token` con el parámetro `token`.

**Verificación:** test con token seed existente → carga devuelve contexto de auditoría; token inexistente → error controlado.

## R14 — Token válido solo en estados de briefing

MIENTRAS `audit.status` pertenece al conjunto `{briefing_enviado, briefing_completo}`, el sistema DEBE considerar el token de briefing válido para acceso del cliente.

**Verificación:** tests con auditoría en cada estado de la máquina; solo los dos estados de briefing permiten acceso.

## R15 — Invalidación del token al avanzar o cerrar

SI `audit.status` es `en_relevamiento`, `en_cierre` o `cerrada`, ENTONCES el sistema DEBE rechazar el token de briefing con pantalla/mensaje «Este enlace ya no está disponible» (HTTP 200 con UI amable o 404 según design).

**Verificación:** tests con auditoría en `en_relevamiento` y `cerrada`; token rechazado con mensaje esperado.

## R16 — Briefing accesible sin sesión interna

CUANDO el token de briefing es válido según R13–R14, el sistema DEBE permitir el acceso a `/briefing/[token]` sin cookie de sesión interna.

**Verificación:** test GET `/briefing/[token]` sin cookie → 200 (o página de briefing); no redirect a `/login`.

## R17 — Usuario inactivo no autentica

SI `app_user.active` es `false`, ENTONCES el sistema DEBE rechazar el login con el mismo mensaje genérico de R8.

**Verificación:** test login con usuario seed inactivo → mensaje genérico, sin fila `session` creada.

## R18 — Contraseñas ausentes de logs

El sistema NO DEBE escribir contraseñas ni hashes completos en logs, respuestas al cliente ni mensajes de error.

**Verificación:** test/revisión de login fallido y exitoso; salida de log mock no contiene password ni `password_hash`.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #3) | Requirements |
|---|---|
| Login user+pass argon2id + cookie HttpOnly Secure | R1, R2, R3 |
| hooks.server.ts session → user → event.locals.user | R4, R5, R6 |
| Guards: técnico crea/ve auditorías; admin sensibles; cliente solo briefing | R10, R11, R12, R16 |
| Token en `/briefing/[token]`, invalidado al avanzar/cerrar | R13, R14, R15 |
| Rate limit en `/login` | R9 |
| Tests de auth y guards pasan | R1–R18 (cada R con ≥1 test) |
