# Design — #53 53_notificaciones_push_pwa

## Alcance

Notificaciones push para usuarios de la app (técnicos/admin) sobre la **PWA instalada** (#7), vía
**Web Push API + VAPID** y la librería **`web-push`** server-side. Suscripción desde la PWA (permiso
del navegador) persistida por usuario/dispositivo en `push_subscription`; el service worker (#7)
maneja `push` y `notificationclick` con notificación **branded SyS**; envío server-side en los
**mismos cinco eventos** internos que el email de #49 (asignación, briefing completado, informe
aprobado, auditoría cerrada, feedback del cliente #47), **reusando
`resolveInternalRecipientUserIds`**; limpieza de endpoints caducados (404/410); preferencia
`notify_push` por usuario. **Complementa, no reemplaza** el email de #49 (corren en paralelo).

| Incluido (MVP) | Excluido |
|---|---|
| `web-push` server, VAPID por `.env` (opcional), no-op sin claves (R1, R2, R12) | SaaS push (FCM/OneSignal/APNs), canales externos |
| Tabla `push_subscription` + upsert por endpoint multi-dispositivo (R3, R4) | Cola persistente / worker de reintento |
| API alta/baja autenticada de suscripción (R4–R6) | Push a clientes externos |
| SW: `push` → notificación branded; `notificationclick` → ruta (R7, R8) | Reemplazar el email #49 |
| Envío en los 5 eventos #49 reusando destinatarios (R9) | Preferencias por evento / centro rico |
| Limpieza 404/410 (R11), preferencia `notify_push` (R10), no rompe negocio (R13) | Generar VAPID en runtime |

## Dependencias

| Feature | Contrato usado |
|---|---|
| `01_stack_scaffolding` (#1) | `serverEnvSchema` + `optionalString`/`emptyToUndefined` (`src/lib/server/env.ts`); `logger` con redacción (`src/lib/server/logger.ts`) |
| `02_modelo_datos` (#2) | Runner `runMigrations`, patrón `migrations/NNN_*.sql`, cliente `sql` postgres.js |
| `07_form_tecnico` (#7) | PWA: `src/service-worker.ts` (handlers `push`/`notificationclick`), `static/manifest.webmanifest`, íconos de marca, `app.html` |
| `11_ui_branding_sys` (#11) | Marca SyS para título/ícono/badge de la notificación |
| `49_servicio_email` | `resolveInternalRecipientUserIds(auditId, evento)` (devuelve userIds; admin involucrado + técnicos asignados, opt-out); puntos de enganche `onAuditoriaAsignada`/`onBriefingCompletado`/`onInformeAprobado`/`onAuditoriaCerrada`/`onFeedbackCliente` (`src/lib/server/email/notify.ts`) |
| usuarios (#3) | `findUserById`, `AppUser` (`active`); guard `event.locals.user` |

## Arquitectura

```
SUSCRIPCIÓN (cliente PWA → server)
  Cliente: pedir permiso (Notification.requestPermission)
           → registration.pushManager.subscribe({ applicationServerKey: VAPID_PUBLIC })   (R2)
           → POST /api/push/subscribe { endpoint, keys:{p256dh,auth}, ua }                 (R4)
           ← upsert por endpoint en push_subscription (user_id de la sesión)               (R4, R6)
  Baja:    DELETE /api/push/subscribe { endpoint } → borra fila del usuario                (R5, R6)

EVENTO INTERNO (server, junto al email #49)
  src/lib/server/email/notify.ts  onAuditoriaAsignada / onBriefingCompletado / onInformeAprobado / onAuditoriaCerrada / onFeedbackCliente
        ├─ (existente #49) resolveInternalRecipientUserIds(auditId, evento) → userIds; emails resueltos desde userIds
        ├─ (existente #49) sendEmail('aviso_*', emails, data)            ← canal email
        └─ (NUEVO #53)     notifyPush(auditId, evento, payload)          ← canal push, try/catch (R13)
                               └─ sendPushToUsers(userIds, evento, payload)   src/lib/server/push/index.ts
                                     filtra notify_push=true (R10)
                                     dry-run si falta VAPID → no-op (R12)
                                     por suscripción: webpush.sendNotification(sub, JSON(payload))
                                         2xx → delivered
                                         404/410 → deletePushSubscription(endpoint) (R11)
                                         otro → failed (no borra) (R11)

SERVICE WORKER (#7, src/service-worker.ts)
  self.addEventListener('push', e => showNotification(payload.title, {body, icon, data:{url}}))  (R7)
  self.addEventListener('notificationclick', e => clients.openWindow/focus(payload.url))         (R8)
```

**Decisión de enganche:** el envío push se conecta **dentro de `notify.ts` de #49**, junto al
`sendEmail`, no en las funciones `db/*` puras (respeta capas de `architecture.md`). `notify.ts` ya
resuelve destinatarios; se extiende para obtener `userId` (no solo email) y llamar `notifyPush(...)`
en un `try/catch` que loguea y no propaga (R13). Así el push **reusa exactamente** la selección de
destinatarios de #49 sin duplicar lógica de asignación.

**Reuso de destinatarios:** #49 ya expone `resolveInternalRecipientUserIds(auditId, evento)` que
devuelve **userIds** (admin involucrado = `created_by` si admin, si no todos los admins activos;
+ técnicos asignados según evento; filtra `active`). Push lo reusa tal cual. El filtro de
preferencia difiere por canal: email usa `notify_internal_email`, push usa `notify_push` (R10). La
**selección base** (qué usuarios) es la misma; cada canal aplica su propio opt-out.

## Cambios de schema — migración `0NN_notificaciones_push.sql`

(0NN = siguiente número disponible al implementar; va **después** de la migración de #49 y de las de
#50/#51/#52. Numerar al implementar, p.ej. `030_notificaciones_push.sql`.)

### `push_subscription`

| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK default `gen_random_uuid()` | |
| user_id | uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE | dueño de la suscripción |
| endpoint | text NOT NULL | URL del push service; **UNIQUE** (upsert) (R4) |
| p256dh | text NOT NULL | clave pública del cliente (cifrado) |
| auth | text NOT NULL | secreto auth del cliente |
| user_agent | text | dispositivo/navegador (informativo, multi-dispositivo) |
| created_at | timestamptz NOT NULL DEFAULT now() | |
| updated_at | timestamptz NOT NULL DEFAULT now() | refrescado en upsert |

```sql
CREATE TABLE IF NOT EXISTS push_subscription (...);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscription_endpoint_uidx ON push_subscription (endpoint);
CREATE INDEX IF NOT EXISTS push_subscription_user_idx ON push_subscription (user_id);

-- Preferencia opt-in/opt-out de push por usuario (R10), independiente del email (#49). Idempotente.
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS notify_push boolean NOT NULL DEFAULT true;
```

Idempotente (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), re-ejecutable. Borrado físico de
suscripciones (no `archived_at`): una suscripción caducada o de baja no tiene valor histórico.

## Archivos a crear/modificar

### Config

| Archivo | Propósito |
|---|---|
| `src/lib/server/env.ts` (extender) | Añadir a `serverEnvSchema`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`optionalString`). Todas opcionales → dev sin VAPID no rompe (R1). Helper `getVapidConfig(): { publicKey; privateKey; subject } \| null` |
| `.env.example` (extender) | Bloque `# ── Push PWA (Web Push / VAPID, #53) ──` con las tres vars y placeholders `<...>`, sin secretos; nota de cómo generarlas con `web-push generate-vapid-keys` (R1) |

### Migración y DB

| Archivo | Propósito |
|---|---|
| `migrations/0NN_notificaciones_push.sql` (nuevo) | `push_subscription` + índices + `app_user.notify_push` (R3, R10) |
| `src/lib/server/db/push-subscription.ts` (nuevo) | `upsertPushSubscription(userId, sub, ua)`, `deletePushSubscriptionByEndpoint(userId, endpoint)`, `deletePushSubscriptionByEndpointAny(endpoint)` (limpieza 404/410), `listPushSubscriptionsByUserIds(userIds)` (R4, R5, R11) |

### Módulo push

| Archivo | Propósito |
|---|---|
| `src/lib/server/push/index.ts` (nuevo) | Contrato `sendPushToUsers(userIds, event, payload)`; tipos `PushEventName`, `PushPayload`, `PushSendResult`. Filtra `notify_push`, no-op sin VAPID (R12), envía por suscripción, limpia 404/410 (R11), nunca lanza |
| `src/lib/server/push/webpush.ts` (nuevo) | Inicializa `web-push` con VAPID de `.env` (`setVapidDetails`); `isPushEnabled()`; `send(sub, payload)`. Mockeable en tests |
| `src/lib/server/push/payloads.ts` (nuevo) | `buildPushPayload(event, data) → PushPayload` branded SyS por evento (title/body/url) |

### API

| Archivo | Propósito |
|---|---|
| `src/routes/api/push/subscribe/+server.ts` (nuevo) | `POST` alta/upsert (Zod: endpoint+keys), `DELETE` baja; ambos requieren `event.locals.user` (R4, R5, R6) |
| `src/routes/api/push/public-key/+server.ts` (nuevo) | `GET` devuelve `{ publicKey }` (VAPID público) para `applicationServerKey`; vacío si no configurado (R2). Alternativa: `PUBLIC_VAPID_PUBLIC_KEY` |

### Enganche #49 (extender)

| Archivo | Cambio |
|---|---|
| `src/lib/server/email/notify.ts` (extender, #49) | Tras `sendEmail` en cada `on*`, llamar `notifyPush(auditId, evento, payload)` en `try/catch` (R9, R13). Extender resolución de destinatarios para exponer `userId`s (helper `resolveInternalRecipientUserIds`) reusando la misma consulta de asignación efectiva + admin |

### PWA / Service worker (#7, extender)

| Archivo | Cambio |
|---|---|
| `src/service-worker.ts` (extender, #7) | Handlers `push` (parse JSON → `showNotification` branded SyS, R7) y `notificationclick` (`clients.openWindow`/`focus` con `payload.url`, R8) |
| `src/lib/client/push/subscribe.ts` (nuevo) | Cliente: pedir permiso, `pushManager.subscribe` con clave pública, POST/DELETE a `/api/push/subscribe`; toggle de preferencia |
| componente UI de ajustes/perfil (extender) | Botón opt-in/opt-out de push que dispara subscribe/unsubscribe + persiste `notify_push` |

### Tests

| Archivo | Cubre |
|---|---|
| `tests/push-config.test.ts` | R1 (env opcional), R2 (clave pública sin privada), R14 (logs sin secretos) |
| `tests/push-schema.test.ts` | R3 (migración 2x idempotente; columnas, UNIQUE endpoint, `notify_push`) |
| `tests/api/push-subscribe.test.ts` | R4 (upsert por endpoint), R5 (baja), R6 (401/ownership) |
| `tests/push-eventos.test.ts` | R9 (eventos→push a destinatarios #49), R10 (opt-out), R11 (404/410 limpia), R12 (no-op sin VAPID), R13 (no rompe negocio) |
| `tests/push-sw.test.ts` | R7 (push→showNotification branded), R8 (click→openWindow url) |

## Firmas principales

```typescript
// src/lib/server/env.ts (extender)
export function getVapidConfig(): { publicKey: string; privateKey: string; subject: string } | null;

// src/lib/server/push/index.ts
export type PushEventName =
  | 'aviso_auditoria_asignada' | 'aviso_briefing_completado' | 'aviso_informe_aprobado';
export type PushPayload = { event: PushEventName; title: string; body: string; url: string; tag?: string };
export type PushSendResult = { attempted: number; delivered: number; removed: number; failed: number };
export async function sendPushToUsers(
  userIds: string[], event: PushEventName, payload: PushPayload
): Promise<PushSendResult>;

// src/lib/server/push/webpush.ts
export function isPushEnabled(): boolean;        // VAPID presente (R12)
export async function send(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: PushPayload
): Promise<{ statusCode: number }>;              // throws WebPushError con statusCode 404/410

// src/lib/server/db/push-subscription.ts
export type StoredPushSubscription = {
  id: string; userId: string; endpoint: string; p256dh: string; auth: string;
};
export async function upsertPushSubscription(
  userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, ua: string | null
): Promise<{ id: string }>;
export async function deletePushSubscriptionByEndpoint(userId: string, endpoint: string): Promise<void>;
export async function deletePushSubscriptionByEndpointAny(endpoint: string): Promise<void>; // limpieza 404/410
export async function listPushSubscriptionsByUserIds(userIds: string[]): Promise<StoredPushSubscription[]>;

// src/lib/server/email/notify.ts (extender, #49)
export async function resolveInternalRecipientUserIds(auditId: string): Promise<string[]>; // base + active
```

## Errores reutilizados / nuevos

- **Reusados:** `logger` (redacción de `VAPID_PRIVATE_KEY`, claves de suscripción, R14); patrón
  `optionalString` de `env.ts`; runner `runMigrations`; `apiError`/envelope (`docs/conventions.md`)
  para los endpoints; `event.locals.user` (auth #3).
- **Nuevos:** ninguna clase de error de dominio. `sendPushToUsers` **no lanza**: captura
  `WebPushError`, distingue `404/410` (elimina suscripción) de otros (cuenta `failed`), y devuelve
  `PushSendResult`. El `notifyPush` en `notify.ts` envuelve en `try/catch` para no propagar (R13).

## Alternativas descartadas

| Alternativa | Motivo descarte |
|---|---|
| SaaS de push (FCM / OneSignal / APNs directo) | Decisión de puerta: Web Push + VAPID self-hosted, sin dependencia de terceros. No reabrir |
| Generar claves VAPID en runtime al arrancar | Las claves deben ser estables (suscripciones existentes dejarían de validar al rotar). Se proveen por `.env`, generadas una vez con `web-push generate-vapid-keys` |
| Disparar push dentro de las funciones `db/*` puras | Acopla la capa de datos al push. Se engancha en `notify.ts` (dominio), junto al email, tras la operación (R13) |
| Módulo de push independiente que re-resuelve destinatarios por su cuenta | Duplicaría la lógica de asignación efectiva de #49 y arriesga divergencia entre canales. Se **reusa** `resolveInternalRecipientUserIds` de #49 |
| Una sola fila de suscripción por usuario | Rompería multi-dispositivo (técnico con celular + tablet). UNIQUE por `endpoint`, varias filas por usuario |
| Preferencia única de notificación (email+push juntas) | Push y email son canales distintos con UX distinta. `notify_push` separado de `notify_internal_email` (R10) |
| Cola persistente + worker de reintento de push | Sobredimensionado para un equipo chico. Envío in-proceso; la limpieza de endpoints caducados (R11) cubre la gestión de estado necesaria |
| No limpiar endpoints caducados (reintentar siempre) | Los push services devuelven 404/410 permanente al expirar; reintentar acumula basura y ruido. 404/410 ⇒ borrar (R11) |
| Lanzar excepción ante fallo de push | Rompería la operación de negocio y el email de #49 que corren en el mismo flujo. Se degrada y registra (R13) |

## Open questions (puerta humana) — RESUELTAS 2026-06-25 (Martín)

1. **Canal — DECIDIDO:** Web Push API + VAPID sobre la PWA instalada (técnicos/admin). No SaaS, no
   clientes externos.
2. **Librería — DECIDIDO:** `web-push` (npm) server-side.
3. **Claves VAPID — DECIDIDO:** por `.env` (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`),
   opcionales; sin claves ⇒ no-op (R12).
4. **Relación con #49 — DECIDIDO:** push **complementa** (no reemplaza) el email; mismos 3 eventos,
   mismos destinatarios (reusa `resolveInternalRecipientUserIds`); preferencia push independiente.
5. **Política de limpieza — DECIDIDO:** 404/410 ⇒ eliminar suscripción; otros errores ⇒ conservar.
   Sin cola de reintento persistente.
