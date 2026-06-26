# Tasks — #52 52_envio_briefing_email

> Orden de implementación. Cada tarea referencia los `R<n>` que cubre.
> Requiere #49 implementado (contrato `sendEmail`, `email_log`, plantilla reservada
> `envio_briefing_cliente` con su schema). Disparo manual; no altera estado de auditoría.

- [ ] T1 — Completar el `render` de la plantilla `envio_briefing_cliente` en
  `src/lib/server/email/templates.ts` (HTML branded SyS vía `layout.ts` + texto plano):
  saludo `contactoNombre`, explicación breve de qué se le pide al cliente, CTA al
  `briefingUrl`. El `schema` Zod ya existe en #49. Cubre: R3.

- [ ] T2 — `tests/envio-briefing-email-template.test.ts`: render con datos válidos
  produce HTML (con tokens de marca) y texto no vacíos que contienen `briefingUrl` y
  `contactoNombre`; datos inválidos → `sendEmail` devuelve `fallido` sin abrir SMTP.
  Cubre: R3.

- [ ] T3 — Crear `src/lib/server/backoffice/briefing-email.ts`:
  `sendBriefingEmail(auditId, user, toOverride?)` con guard
  `admin || techIsAssigned(auditId, user.id)` (R8), guard de estado vía
  `canShowBriefingLink` (R2), validación del destinatario con
  `briefingEmailRecipientSchema` (R4), cómputo de `briefingUrl` (`getBriefingUrl`) y
  `contactoNombre` (`empresa.referente_nombre ?? razon_social`), y llamada a
  `sendEmail('envio_briefing_cliente', to, data)` (R5). NO toca `audit.status` ni
  `public_token` (R9). Cubre: R2, R4, R5, R8, R9.

- [ ] T4 — En el mismo archivo, `getBriefingEmailMark(auditId)`: deriva la marca del
  último envío desde `email_log` (`listEmailLogByTemplate('envio_briefing_cliente')`
  acotado a los emails del cliente de la auditoría) → `{ sentTo, sentAt } | null`.
  Cubre: R6, R7, R11.

- [ ] T5 — `tests/api/envio-briefing-email-send.test.ts` (dry-run / transporte mock #49):
  destinatario prefilleado y email inválido → sin fila en `email_log` (R4); envío
  inserta fila `dry_run` con `template = 'envio_briefing_cliente'` y `briefingUrl`
  correcto (R5); marca expuesta tras envío (R6); dos envíos → dos filas, marca = último
  (R7); `admin` y técnico asignado OK, técnico no asignado → 403 (R8); `status` y
  `public_token` sin cambios antes/después (R9). Cubre: R4, R5, R6, R7, R8, R9.

- [ ] T6 — Extender `src/routes/(app)/auditorias/[id]/+page.server.ts`:
  `load` expone `contactEmail` (`empresa.email`), `contactName`,
  `canSendBriefingEmail` (R2) y `briefingEmail` (`getBriefingEmailMark`, R6);
  `actions.enviarBriefingEmail` parsea destinatario, llama `sendBriefingEmail`, mapea
  errores de dominio a `fail` (403/409/400) y devuelve `{ success, status, sentTo }`.
  Cubre: R2, R4, R6, R8, R9, R10.

- [ ] T7 — `tests/envio-briefing-email-enable.test.ts`: matriz de `canSendBriefingEmail`
  (token vigente + email → true; sin token / `borrador` / `cerrada` / sin email → false).
  Cubre: R2.

- [ ] T8 — Extender `src/routes/(app)/auditorias/[id]/+page.svelte`: botón "Enviar
  briefing por mail" junto al bloque de link de briefing, deshabilitado según
  `canSendBriefingEmail`; modal de confirmación con destinatario prefilleado y editable;
  toast de éxito/error (#38) según resultado de la action. Cubre: R1, R2, R4, R10.

- [ ] T9 — `tests/envio-briefing-email-schema.test.ts`: verifica que la marca (R6) se
  deriva de `email_log` sin migración nueva (consulta por plantilla + email del cliente);
  SI durante T3/T4 se decidió añadir migración idempotente para `audit_id`, en su lugar
  verifica que aplicarla dos veces no falla. Cubre: R11.

- [ ] T10 — `e2e/envio-briefing-email.spec.ts`: fixture de auditoría en `briefing_enviado`
  con contacto con email; el detalle muestra el botón (R1), abre confirmación con el
  destinatario, confirma y muestra toast de éxito (dry-run); el detalle muestra la marca
  "Briefing enviado a {email} el {fecha}" (R6). Cubre: R1, R6, R10.

- [ ] T11 — Verificación final: `pnpm run check`, `pnpm test` y
  `pnpm exec playwright test e2e/envio-briefing-email.spec.ts` en verde sin SMTP real;
  registrar el mapa R↔test en `progress/impl_52_envio_briefing_email.md`. Cubre: R12.

## Mapa R → test

| R | Test principal |
|---|---|
| R1 | `e2e/envio-briefing-email.spec.ts` |
| R2 | `tests/envio-briefing-email-enable.test.ts` |
| R3 | `tests/envio-briefing-email-template.test.ts` |
| R4 | `tests/api/envio-briefing-email-send.test.ts` |
| R5 | `tests/api/envio-briefing-email-send.test.ts` |
| R6 | `tests/api/envio-briefing-email-send.test.ts`, `e2e/envio-briefing-email.spec.ts` |
| R7 | `tests/api/envio-briefing-email-send.test.ts` |
| R8 | `tests/api/envio-briefing-email-send.test.ts` |
| R9 | `tests/api/envio-briefing-email-send.test.ts` |
| R10 | `e2e/envio-briefing-email.spec.ts` |
| R11 | `tests/envio-briefing-email-schema.test.ts` |
| R12 | suite completa (`pnpm test` + e2e) |
