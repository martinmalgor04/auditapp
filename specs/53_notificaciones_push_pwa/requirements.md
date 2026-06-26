# Requirements — #53 53_notificaciones_push_pwa

> Notificaciones **push** para los usuarios de la app (técnicos/admin) sobre la **PWA instalada en
> el celular** (#7), vía **Web Push API + claves VAPID** y la librería **`web-push`** (server-side).
> El push **complementa, no reemplaza** los avisos internos por email de #49: se dispara en los
> **mismos cinco eventos** (auditoría asignada, briefing completado, informe aprobado, **auditoría
> cerrada** y **feedback del cliente** — encuesta #47 respondida) y **reusa la selección de
> destinatarios** de #49 (`resolveInternalRecipientUserIds`).
>
> **Decisiones de puerta (Martín, 2026-06-25), spec firme — no reabrir:**
> 1. Canal: **Web Push API + VAPID** sobre la PWA instalada (técnicos/admin de la app). **No**
>    clientes externos, **no** SaaS de push (no FCM/OneSignal/APNs directo).
> 2. Librería server: **`web-push`** (npm). Genera/usa el header VAPID y cifra el payload.
> 3. Claves VAPID por `.env` (env.ts): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
>    Todas **opcionales** → dev sin VAPID no rompe el arranque ni el resto de la app.
> 4. **Modo dry-run / no-op:** MIENTRAS falten claves VAPID, el envío de push NO se intenta; se
>    registra el intento y no se abre conexión al push service.
> 5. **Push + email SIEMPRE en paralelo:** cuando el usuario tiene `notify_push = true` recibe el push
>    Y, en paralelo, IGUAL recibe el email del mismo evento de #49. No hay supresión de email. Cada
>    canal aplica su **propio opt-out** (`notify_push` para push, `notify_internal_email` para email).
>    El push **complementa**, no reemplaza. El enganche está en la capa de avisos de #49
>    (`src/lib/server/email/notify.ts`), tras la operación de negocio.
> 6. **Activación desde el perfil (#48):** la suscripción push se activa con un **toggle en la pantalla
>    de perfil (#48)** que pide el permiso del navegador e inscribe la suscripción (endpoint+claves)
>    por usuario/dispositivo. **Frontera de alcance:** #48 **aloja** el toggle de preferencia que
>    refleja/edita `app_user.notify_push`; **#53** crea la COLUMNA `notify_push`, la tabla
>    `push_subscription` y TODA la mecánica Web Push (permiso, suscripción, service worker, envío,
>    limpieza). El cliente reutilizable (`src/lib/client/push/subscribe.ts`) lo entrega #53; #48 lo
>    consume desde la UI de perfil.
>
> Depende de: `01_stack_scaffolding` (#1, done) — `src/lib/server/env.ts` (config Zod por `.env`,
> patrón `optionalString`/`emptyToUndefined`), `src/lib/server/logger.ts` (logs con redacción de
> secretos); `02_modelo_datos` (#2, done) — runner `runMigrations` y patrón `migrations/NNN_*.sql`;
> `07_form_tecnico` (#7) — PWA (`static/manifest.webmanifest`, `src/service-worker.ts`, `app.html`)
> donde se engancha el evento `push`; `11_ui_branding_sys` (#11) — branding SyS de la notificación;
> `20_audit_assignment`/`33` — asignación efectiva; `47_encuesta_conformidad` (#47) — evento de
> feedback del cliente (encuesta respondida); **`48_perfil_usuario`** (#48) — aloja el toggle de
> preferencia `notify_push` en el perfil (la columna y la mecánica las define #53); **`49_servicio_email`**
> — los **cinco** eventos internos y `resolveInternalRecipientUserIds(auditId, evento)`, puntos de
> enganche `onAuditoriaAsignada`/`onBriefingCompletado`/`onInformeAprobado`/`onAuditoriaCerrada`/
> `onFeedbackCliente`. NO reemplaza el email de #49 (corren en paralelo).

## Contrato público (estable)

```typescript
// src/lib/server/push/index.ts
export type PushEventName =
  | 'aviso_auditoria_asignada'
  | 'aviso_briefing_completado'
  | 'aviso_informe_aprobado'
  | 'aviso_auditoria_cerrada'
  | 'aviso_feedback_cliente';

// Payload JSON que recibe el service worker en el evento 'push' (cifrado por web-push).
export type PushPayload = {
  event: PushEventName;
  title: string;          // branded SyS, p.ej. "SyS · Auditoría asignada"
  body: string;           // texto corto con referencia de auditoría + cliente
  url: string;            // ruta relativa de la app a abrir al click (p.ej. /audits/<id>)
  tag?: string;           // agrupa/colapsa notificaciones del mismo evento+auditoría
};

export type PushSendResult = {
  attempted: number;      // suscripciones a las que se intentó enviar
  delivered: number;      // 2xx del push service
  removed: number;        // suscripciones eliminadas por 404/410
  failed: number;         // otros errores (no eliminan suscripción)
};

export async function sendPushToUsers(
  userIds: string[], event: PushEventName, payload: PushPayload
): Promise<PushSendResult>;
```

## R1 — Claves VAPID configurables 100% por `.env`, opcionales

El sistema DEBE extender `serverEnvSchema` (`src/lib/server/env.ts`) con `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` como **opcionales** (patrón `optionalString`/
`emptyToUndefined` existente), de modo que el arranque en dev local sin VAPID NO falle.

**Verificación:** `tests/push-config.test.ts` — `serverEnvSchema` parsea sin las tres vars (no
lanza) y con valores válidos; `.env.example` lista las tres vars con placeholders `<...>`, sin
secretos.

## R2 — La clave pública VAPID se expone al cliente para suscribirse

El sistema DEBE exponer la **clave pública** VAPID al browser (vía endpoint server o variable
`PUBLIC_*`) para que la PWA la use como `applicationServerKey`, sin exponer NUNCA la clave privada.

**Verificación:** `tests/push-config.test.ts` — el helper/endpoint que entrega la clave pública
devuelve `VAPID_PUBLIC_KEY` y NO contiene `VAPID_PRIVATE_KEY`; con VAPID ausente devuelve vacío/null.

## R3 — Migración SQL idempotente crea `push_subscription` y la preferencia

El sistema DEBE incluir la migración `0NN_notificaciones_push.sql` (0NN = siguiente número
disponible al implementar; va **después** de la migración de #49 y de #50/#51/#52) que crea la
tabla `push_subscription` (endpoint, claves p256dh/auth, user, dispositivo, timestamps) con
`CREATE TABLE IF NOT EXISTS`, índice único por `endpoint` y la columna `app_user.notify_push`
(boolean, default `true`) vía `ADD COLUMN IF NOT EXISTS`, re-ejecutable sin error.

**Verificación:** `tests/push-schema.test.ts` — aplicar la migración dos veces no falla;
`push_subscription` existe con las columnas y la restricción `UNIQUE(endpoint)` de design §Schema, y
`app_user.notify_push` existe con default `true`.

## R4 — Alta de suscripción push por usuario y dispositivo

CUANDO un usuario autenticado envía su `PushSubscription` (endpoint + claves p256dh/auth) desde la
PWA, el sistema DEBE persistirla en `push_subscription` asociada a su `user_id`, **upsert por
`endpoint`** (re-suscribir el mismo endpoint actualiza claves/`updated_at`, no duplica fila),
soportando múltiples filas por usuario (multi-dispositivo).

**Verificación:** `tests/api/push-subscribe.test.ts` — un POST con suscripción válida de un usuario
autenticado inserta una fila; un segundo POST del **mismo endpoint** actualiza la fila (no crea
otra); dos endpoints distintos del mismo usuario producen dos filas.

## R5 — Baja de suscripción push por el usuario

CUANDO un usuario solicita darse de baja de un endpoint (al revocar permiso o desinstalar), el
sistema DEBE eliminar la fila de `push_subscription` correspondiente a ese `endpoint` del usuario.

**Verificación:** `tests/api/push-subscribe.test.ts` — un DELETE/unsubscribe con un endpoint
existente del usuario elimina su fila; un endpoint que no le pertenece no afecta filas ajenas.

## R6 — Solo usuarios autenticados gestionan sus propias suscripciones

SI una petición de alta/baja de suscripción llega sin sesión válida ENTONCES el sistema DEBE
responder `401` y NO DEBE tocar `push_subscription`; un usuario NO DEBE poder alta/baja de
suscripciones de otro usuario.

**Verificación:** `tests/api/push-subscribe.test.ts` — sin sesión el endpoint devuelve `401` y no
inserta/borra; un usuario no puede eliminar el endpoint de otro (sin efecto / 404).

## R7 — El service worker maneja el evento `push` y muestra notificación branded SyS

CUANDO el service worker (#7) recibe un evento `push` con un `PushPayload` válido, el sistema DEBE
mostrar una notificación **branded SyS** (título, cuerpo, ícono/badge de marca SyS) usando
`self.registration.showNotification`, derivando `title`/`body`/`icon` del payload.

**Verificación:** `tests/push-sw.test.ts` — dado un evento `push` simulado con `PushPayload`, el
handler llama `showNotification` con el `title` y `body` del payload e ícono de marca SyS; un push
sin datos válidos no rompe el SW (no lanza).

## R8 — El click en la notificación abre la ruta relevante

CUANDO el usuario hace click en la notificación, el service worker DEBE abrir/enfocar la ventana de
la PWA en la `url` del payload (reusando una pestaña existente de la app si la hay, abriendo una
nueva si no).

**Verificación:** `tests/push-sw.test.ts` — el handler `notificationclick` invoca
`clients.openWindow`/`focus` con la `url` del payload; cierra la notificación tras el click.

## R9 — Envío server-side de push en los cinco eventos internos de #49

CUANDO ocurre uno de los **cinco** eventos internos de #49 (auditoría asignada, briefing completado,
informe aprobado, **auditoría cerrada**, **feedback del cliente** — encuesta #47 respondida), el
sistema DEBE enviar push a las suscripciones de los **mismos destinatarios** que el email de #49,
resueltos vía `resolveInternalRecipientUserIds(auditId, evento)` (#49, misma regla: admin
involucrado = `audit.created_by` si es admin, si no → todos los admins activos; + técnicos asignados
según el evento; sin inactivos), con un `PushPayload` branded del evento.

**Verificación:** `tests/push-eventos.test.ts` — disparar cada uno de los cinco eventos envía push a
las suscripciones de los técnicos asignados + admin involucrado; un usuario destinatario sin
suscripción no genera intento de envío pero tampoco rompe; los destinatarios coinciden con los de #49
(misma `resolveInternalRecipientUserIds`) para el mismo evento.

## R10 — Preferencia opt-in/opt-out de push por usuario, independiente del email

El sistema DEBE persistir `app_user.notify_push` (default `true`) y, SI un usuario tiene
`notify_push = false`, ENTONCES NO DEBE enviarle push en los eventos internos, **sin** afectar su
preferencia de email (`notify_internal_email`, #49) ni viceversa. Cada canal es **independiente**:
push y email se evalúan y disparan **en paralelo**, cada uno con su propio opt-out.

**Verificación:** `tests/push-eventos.test.ts` — un usuario con `notify_push = false` no recibe push
aunque tenga suscripción y `notify_internal_email = true`; un usuario con `notify_push = true` y
`notify_internal_email = false` sí recibe push; un usuario con ambos en `true` recibe push **y** email
del mismo evento (sin supresión de un canal por el otro).

## R11 — Endpoints caducados (404/410) eliminan la suscripción

SI el push service responde `404` o `410` al enviar a una suscripción ENTONCES el sistema DEBE
eliminar esa fila de `push_subscription`; otros errores (timeout, 5xx) NO DEBEN eliminar la fila.

**Verificación:** `tests/push-eventos.test.ts` — con un `web-push` mockeado que devuelve `410`/`404`
para un endpoint, ese endpoint se elimina de `push_subscription`; con un `500`/timeout la fila
permanece y el resultado lo cuenta como `failed`.

## R12 — Dry-run / no-op cuando falta configuración VAPID

MIENTRAS las claves VAPID no estén configuradas (falta `VAPID_PRIVATE_KEY` o `VAPID_PUBLIC_KEY`), el
sistema DEBE operar el envío en **modo no-op**: NO abrir conexión al push service ni cifrar payload,
devolviendo `PushSendResult` con `delivered: 0` (sin error de configuración propagado).

**Verificación:** `tests/push-eventos.test.ts` — con VAPID ausente, `sendPushToUsers(...)` no invoca
`web-push.sendNotification` y devuelve un resultado no-op (`attempted` puede contar suscripciones,
`delivered` = 0); no lanza.

## R13 — El push nunca rompe la operación de negocio que lo dispara

SI el envío de push falla (push service caído, error de cifrado, VAPID ausente) ENTONCES el sistema
DEBE registrar el fallo (`logger`) y permitir que la operación de negocio que lo disparó (asignar,
completar briefing, aprobar informe, cerrar auditoría, registrar feedback) y el **aviso por email de
#49** (que corre en paralelo) completen igualmente; el push NO DEBE propagar la excepción al flujo
principal ni interferir con el envío de email.

**Verificación:** `tests/push-eventos.test.ts` — con un `web-push` que siempre falla, disparar cada
uno de los cinco eventos completa sin lanzar; el fallo queda logueado y el email de #49 se sigue
enviando (canales independientes).

## R14 — Logs sin secretos

El sistema DEBE loguear los envíos vía `logger` sin exponer `VAPID_PRIVATE_KEY` ni las claves
`p256dh`/`auth` de las suscripciones (reusa la redacción de `logger.ts`).

**Verificación:** `tests/push-config.test.ts` — los logs emitidos durante un envío no contienen el
valor de `VAPID_PRIVATE_KEY` ni las claves de suscripción.

## R15 — Tests unitarios e integración

El sistema DEBE incluir tests vitest (`tests/push-config.test.ts`, `tests/push-schema.test.ts`,
`tests/api/push-subscribe.test.ts`, `tests/push-eventos.test.ts`, `tests/push-sw.test.ts`) que
cubran alta/baja de suscripción, selección de destinatarios por evento, limpieza de endpoints
caducados, respeto de preferencia, dry-run y el manejo del evento `push`/`notificationclick` del SW,
ejecutables sin push service real (`web-push` mockeado).

**Verificación:** `pnpm test` ejecuta la suite de push en verde sin push service externo.

## R16 — Activación de la suscripción desde el perfil (#48), frontera de alcance

El sistema (#53) DEBE proveer un cliente reutilizable (`src/lib/client/push/subscribe.ts`) que pida
el permiso del navegador, ejecute `pushManager.subscribe` con la clave pública (R2) y dé alta/baja la
suscripción vía `/api/push/subscribe` (R4, R5), de modo que el **toggle de la pantalla de perfil
(#48)** lo consuma para activar/desactivar push y persistir `notify_push`. La **columna**
`app_user.notify_push`, la **tabla** `push_subscription` y toda la **mecánica Web Push** las define
#53 (R3, R4, R5, R7, R8); #48 únicamente **aloja** el control de UI que invoca este cliente.

**Verificación:** `tests/api/push-subscribe.test.ts` / `tests/push-config.test.ts` — el cliente
`subscribe.ts` existe y expone funciones de alta/baja que llaman a `/api/push/subscribe`; activar el
toggle inscribe la suscripción del dispositivo del usuario autenticado y deja `notify_push = true`;
desactivarlo da de baja y deja `notify_push = false`. (La UI del toggle se valida en los tests de #48;
#53 valida el cliente y los endpoints que el toggle consume.)

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #53) | Requirements |
|---|---|
| Suscripción push desde la PWA (toggle de perfil #48); guardada por usuario/dispositivo en Postgres | R3, R4, R6, R16 |
| Claves VAPID por `.env`; `.env.example` sin secretos | R1, R2 |
| SW maneja `push` y muestra notificación branded SyS; click abre ruta | R7, R8 |
| Envío push en los cinco eventos internos a los destinatarios correspondientes | R9 |
| Endpoints caducados (410/404) eliminan suscripción; multi-dispositivo | R4, R11 |
| Preferencia opt-in/opt-out por usuario respetada (push y email en paralelo) | R10 |
| Migración SQL idempotente para `push_subscription` y preferencias | R3 |
| Tests: alta/baja, destinatarios, limpieza, preferencias, evento push del SW | R4, R5, R9, R10, R11, R15 |

## Fuera de alcance (no implementar)

- Reemplazar el email de #49: el push lo **complementa**, ambos canales conviven.
- SaaS / canales externos de push (FCM, OneSignal, APNs directo): solo Web Push + VAPID.
- Notificaciones push a clientes externos (no usuarios de la app).
- Centro de preferencias rico / por evento: solo el booleano `notify_push`.
- Cola persistente / worker de reintento: el envío es in-proceso; la limpieza de endpoints
  caducados (R11) es la única gestión de estado de suscripción.
- Generación de claves VAPID en runtime: se proveen por `.env` (generadas una vez con `web-push`).
