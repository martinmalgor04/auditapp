# Trazabilidad — #52 Envío del link de briefing al cliente por email

Implementado 2026-06-27. Todas las tareas T1–T11 completadas. `pnpm test` 257 archivos en verde. `pnpm run check` 0 errores.

## Mapa R → test

| R | Test |
|---|---|
| R1 | `e2e/envio-briefing-email.spec.ts` — botón visible en detalle con token vigente + email |
| R2 | `tests/envio-briefing-email-enable.test.ts` — matriz completa token/estado/email |
| R3 | `tests/envio-briefing-email-template.test.ts` — render HTML+texto, marca SyS, datos inválidos |
| R4 | `tests/api/envio-briefing-email-send.test.ts` — email inválido → ValidationError sin email_log |
| R5 | `tests/api/envio-briefing-email-send.test.ts` — fila dry_run con template + briefingUrl |
| R6 | `tests/api/envio-briefing-email-send.test.ts` + `e2e/envio-briefing-email.spec.ts` — marca sentTo + sentAt |
| R7 | `tests/api/envio-briefing-email-send.test.ts` — dos envíos → dos filas; marca = último |
| R8 | `tests/api/envio-briefing-email-send.test.ts` — admin OK, tech asignado OK, tech no asignado → ForbiddenError |
| R9 | `tests/api/envio-briefing-email-send.test.ts` — status y public_token sin cambios tras envío |
| R10 | `e2e/envio-briefing-email.spec.ts` — modal con destinatario, confirmar → toast éxito |
| R11 | `tests/envio-briefing-email-schema.test.ts` — sin columna audit_id; marca derivada de email_log |
| R12 | suite completa (257 archivos, 1486 tests) |

## Archivos creados / modificados

### Nuevos
- `src/lib/server/backoffice/briefing-email.ts` — `sendBriefingEmail`, `getBriefingEmailMark`, `briefingEmailRecipientSchema`
- `tests/envio-briefing-email-template.test.ts` — R3
- `tests/envio-briefing-email-enable.test.ts` — R2
- `tests/api/envio-briefing-email-send.test.ts` — R4, R5, R6, R7, R8, R9
- `tests/envio-briefing-email-schema.test.ts` — R11
- `e2e/envio-briefing-email.spec.ts` — R1, R6, R10

### Modificados
- `src/lib/server/email/templates.ts` — completó `render` de `envio_briefing_cliente` (T1)
- `src/routes/(app)/auditorias/[id]/+page.server.ts` — load expone contactEmail/canSendBriefingEmail/briefingEmail; action `enviarBriefingEmail` (T6)
- `src/routes/(app)/auditorias/[id]/+page.svelte` — botón + modal + toast (T8)
- `specs/52_envio_briefing_email/tasks.md` — T1–T11 marcadas [x]
- `feature_list.json` — status #52 → `done`

## Decisiones de implementación

- **Marca sin migración** (R11): `getBriefingEmailMark` filtra `email_log` por `template = 'envio_briefing_cliente'` y `to_email = empresa.email`, ordenando por `created_at DESC`. No se añadió columna `audit_id` a `email_log`.
- **Guard en dominio** (R8): `sendBriefingEmail` lanza `ForbiddenError` si el usuario no es admin ni tiene fila en `audit_assignment` para esa auditoría. La form action mapea al `failFromError` existente.
- **Toast en .svelte** (R10): implementado inline con `$state` + `$effect` en `+page.svelte`, sin componente separado, siguiendo el patrón mínimo del proyecto.
