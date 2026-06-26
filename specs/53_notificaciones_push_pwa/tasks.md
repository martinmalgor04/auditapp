# Tasks — #53 53_notificaciones_push_pwa

> Orden de implementación. Cada paso referencia los `R<n>` que cubre. No marcar `done` sin tests en
> verde (`pnpm test`, `pnpm run check`). El push **complementa** el email de #49 (no lo reemplaza) y
> **reusa** la selección de destinatarios de #49.

## Config y dependencias

- [ ] T1 — Agregar dependencia `web-push` (+ `@types/web-push`) al `package.json`. Cubre: R9, R11.
- [ ] T2 — Extender `serverEnvSchema` en `src/lib/server/env.ts` con `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`optionalString`) y helper `getVapidConfig()`. Cubre: R1, R2.
- [ ] T3 — Extender `.env.example` con bloque `# ── Push PWA (Web Push / VAPID, #53) ──`,
  placeholders `<...>` sin secretos y nota `web-push generate-vapid-keys`. Cubre: R1.

## Migración y DB

- [ ] T4 — Crear `migrations/0NN_notificaciones_push.sql` (0NN = siguiente libre, después de #49 y
  #50/#51/#52): `push_subscription` (UNIQUE endpoint, índice user_id) + `app_user.notify_push`
  default `true`, todo idempotente (`IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`). Cubre: R3, R10.
- [ ] T5 — Crear `src/lib/server/db/push-subscription.ts`: `upsertPushSubscription`,
  `deletePushSubscriptionByEndpoint`, `deletePushSubscriptionByEndpointAny`,
  `listPushSubscriptionsByUserIds`. SQL parametrizado postgres.js. Cubre: R4, R5, R11.

## Módulo push server

- [ ] T6 — Crear `src/lib/server/push/webpush.ts`: `isPushEnabled()` (VAPID presente),
  `setVapidDetails` lazy, `send(sub, payload)` que propaga `statusCode`. Mockeable. Cubre: R12.
- [ ] T7 — Crear `src/lib/server/push/payloads.ts`: `buildPushPayload(event, data)` branded SyS
  (title/body/url/tag) por evento. Cubre: R7, R9.
- [ ] T8 — Crear `src/lib/server/push/index.ts`: `sendPushToUsers(userIds, event, payload)` — filtra
  `notify_push=true`, no-op sin VAPID, envía por suscripción, elimina 404/410, cuenta resultado,
  nunca lanza, loguea sin secretos. Cubre: R9, R10, R11, R12, R13, R14.

## API

- [ ] T9 — Crear `src/routes/api/push/subscribe/+server.ts`: `POST` upsert (Zod endpoint+keys) y
  `DELETE` baja, ambos exigiendo `event.locals.user` (401 sin sesión, ownership). Cubre: R4, R5, R6.
- [ ] T10 — Crear `src/routes/api/push/public-key/+server.ts` (`GET` clave pública VAPID, vacío si no
  configurada; nunca expone la privada). Cubre: R2.

## Enganche con #49 (complementa email)

- [ ] T11 — Extender `src/lib/server/email/notify.ts`: helper `resolveInternalRecipientUserIds`
  (reusa la misma consulta de asignación efectiva + admin de #49) y, tras `sendEmail` en
  `onAuditoriaAsignada`/`onBriefingCompletado`/`onInformeAprobado`, llamar `notifyPush(...)` en
  `try/catch` que loguea y no propaga. Cubre: R9, R10, R13.

## PWA / Service worker (#7)

- [ ] T12 — Extender `src/service-worker.ts` (#7): handler `push` → `showNotification` branded SyS
  (ícono/badge de marca) desde el `PushPayload`; tolera payload inválido sin romper. Cubre: R7.
- [ ] T13 — Extender `src/service-worker.ts`: handler `notificationclick` → `clients.openWindow`/
  `focus` con `payload.url`; cierra la notificación. Cubre: R8.
- [ ] T14 — Crear `src/lib/client/push/subscribe.ts` + UI opt-in/opt-out en ajustes/perfil: permiso,
  `pushManager.subscribe` con clave pública (T10), POST/DELETE a `/api/push/subscribe`, toggle
  `notify_push`. Cubre: R4, R5, R10.

## Tests (trazabilidad R↔test)

- [ ] T15 — `tests/push-config.test.ts`: env opcional, clave pública sin privada, logs sin secretos.
  Cubre: R1, R2, R14.
- [ ] T16 — `tests/push-schema.test.ts`: migración 2x idempotente; columnas, UNIQUE endpoint,
  `notify_push`. Cubre: R3.
- [ ] T17 — `tests/api/push-subscribe.test.ts`: upsert por endpoint, multi-dispositivo, baja,
  401/ownership. Cubre: R4, R5, R6.
- [ ] T18 — `tests/push-eventos.test.ts` (`web-push` mockeado): eventos → push a destinatarios de
  #49, opt-out `notify_push`, limpieza 404/410, no-op sin VAPID, no rompe negocio ni email.
  Cubre: R9, R10, R11, R12, R13.
- [ ] T19 — `tests/push-sw.test.ts`: `push` → `showNotification` branded; `notificationclick` →
  `openWindow` con url. Cubre: R7, R8, R15.
- [ ] T20 — Verificar `pnpm test`, `pnpm run check` y `./init.sh` en verde; actualizar mapa de
  trazabilidad en `progress/impl_53_notificaciones_push_pwa.md` (cada R con su test). Cubre: R15.
