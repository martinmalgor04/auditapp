# Implementación #53 — Notificaciones push en la PWA

## Resumen

Feature completa implementada el 2026-06-27.
`pnpm test` → 1521 tests passed, 0 errores. `pnpm run check` → 0 errores.

## Archivos creados / modificados

### Nuevos
- `migrations/028_notificaciones_push.sql` — tabla `push_subscription` + `app_user.notify_push`
- `src/lib/server/db/push-subscription.ts` — upsert, delete, list por userIds
- `src/lib/server/push/index.ts` — `sendPushToUsers`, tipos `PushEventName`/`PushPayload`/`PushSendResult`
- `src/lib/server/push/webpush.ts` — wrapper `web-push` con lazy init y `isPushEnabled()`
- `src/lib/server/push/payloads.ts` — `buildPushPayload` branded SyS por evento
- `src/routes/api/push/subscribe/+server.ts` — POST upsert / DELETE baja
- `src/routes/api/push/public-key/+server.ts` — GET clave pública VAPID
- `src/lib/client/push/subscribe.ts` — cliente PWA: permiso + suscripción + baja
- `tests/push-config.test.ts`
- `tests/push-schema.test.ts`
- `tests/api/push-subscribe.test.ts`
- `tests/push-eventos.test.ts`
- `tests/push-sw.test.ts`

### Modificados
- `src/lib/server/env.ts` — VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT + `getVapidConfig()`
- `.env.example` — bloque VAPID con placeholders y nota de generación
- `src/lib/server/email/notify.ts` — `notifyPush()` en paralelo con email en los 5 eventos
- `static/sw.js` — handlers `push` (showNotification branded) y `notificationclick` (openWindow)
- `src/routes/(app)/perfil/+page.svelte` — toggle push opt-in/opt-out
- `specs/53_notificaciones_push_pwa/tasks.md` — todas las tasks marcadas [x]
- `feature_list.json` — status → done
- `package.json` / `pnpm-lock.yaml` — `web-push` + `@types/web-push`

## Trazabilidad R↔test

| Requirement | Test |
|---|---|
| R1 — VAPID opcional, no rompe arranque | `tests/push-config.test.ts` — "parsea sin vars VAPID (no lanza)" |
| R2 — Clave pública sin privada al cliente | `tests/push-config.test.ts` — "getVapidConfig expone publicKey…" |
| R3 — Migración idempotente, push_subscription, notify_push | `tests/push-schema.test.ts` — 5 tests |
| R4 — Alta/upsert por endpoint | `tests/api/push-subscribe.test.ts` — "inserta", "upsert", "multi-dispositivo" |
| R5 — Baja de suscripción | `tests/api/push-subscribe.test.ts` — "DELETE endpoint existente…" |
| R6 — 401 sin sesión, ownership | `tests/api/push-subscribe.test.ts` — "POST sin sesión", "DELETE endpoint de otro usuario" |
| R7 — SW push → showNotification branded | `tests/push-sw.test.ts` — "payload válido → showNotification…", "ícono brand SyS" |
| R8 — notificationclick → openWindow/focus | `tests/push-sw.test.ts` — "click abre la url…", "usa ventana existente" |
| R9 — Envío en los 5 eventos internos | `tests/push-eventos.test.ts` — "con VAPID activo, envía push…", "sin suscripción no genera intento" |
| R10 — Preferencia notify_push independiente email | `tests/push-eventos.test.ts` — "notify_push=false no recibe push", "notify_push=true con email desactivado sigue recibiendo push" |
| R11 — 410/404 elimina suscripción; 500 conserva | `tests/push-eventos.test.ts` — "endpoint 410 elimina…", "error 500 NO elimina…" |
| R12 — No-op sin VAPID | `tests/push-eventos.test.ts` — "sin VAPID configurado, devuelve no-op (delivered=0)" |
| R13 — No rompe operación de negocio | `tests/push-eventos.test.ts` — "sendPushToUsers nunca lanza aunque web-push falle" |
| R14 — Logs sin secretos | `tests/push-config.test.ts` — "el módulo push/index importa logger (no expone secretos)" |
| R15 — Suite completa ejecutable | `pnpm test` → 262 test files, 1521 tests, 0 errores |
| R16 — Cliente reutilizable desde perfil | `src/lib/client/push/subscribe.ts` exportado; toggle en `perfil/+page.svelte` |
