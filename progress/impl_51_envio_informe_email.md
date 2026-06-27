# Trazabilidad — #51 Envío del informe al cliente por email

## Mapa R↔test

| Req | Descripción | Tests |
|-----|-------------|-------|
| R1 | Botón habilitado solo con informe aprobado y email válido | `e2e/envio-informe-email.spec.ts` — botón habilitado; botón deshabilitado con borrador/sin email |
| R2 | Guard server-side: solo sobre informe aprobado (409 si borrador) | `tests/api/informe-enviar.test.ts` — 409 informe borrador |
| R3 | Destinatario prefilleado, editable y validado Zod | `tests/informe-enviar.test.ts` — schema acepta/rechaza; `tests/api/informe-enviar.test.ts` — 400 Zod; `e2e/envio-informe-email.spec.ts` — prefill |
| R4 | Email branded SyS sin material interno | `tests/email-templates.test.ts` — render con `informeUrl`/`pdfUrl`, fixture `upsell_findings`/`internal_draft` → no aparece; `tests/informe-enviar.test.ts` — data sin campos internos |
| R5 | Guard: solo admin o técnico asignado | `tests/api/informe-enviar.test.ts` — 401 sin sesión, 403 técnico no asignado, 200 admin y técnico asignado |
| R6 | Confirmación previa y toast de resultado | `e2e/envio-informe-email.spec.ts` — modal y toast éxito |
| R7 | Cada envío en email_log, marca "informe enviado", reenvío | `tests/api/informe-enviar.test.ts` — fila email_log por envío, reenvío agrega fila; `tests/informe-enviado.test.ts` — listInformeEnvios devuelve destinatario+fecha; `e2e/envio-informe-email.spec.ts` — marca visible |
| R8 | Fallo de envío → 502 genérico sin SMTP_* | `tests/api/informe-enviar.test.ts` — 502 con mensaje genérico, sin SMTP_* |
| R9 | Tests en verde sin SMTP real | `pnpm test` 253/253 pass; `pnpm run check` 0 errores |

## Archivos creados/modificados

| Archivo | Tipo | Cambio |
|---------|------|--------|
| `src/lib/server/email/templates.ts` | extendido (previo) | `render` de `envio_informe_cliente` ya completo |
| `src/lib/server/informe/enviar.ts` | nuevo | `enviarInformeSchema`, `enviarInforme`, `listInformeEnvios` |
| `src/lib/server/informe/access.ts` | modificado | `AuditForReport` + `getAuditForReport` exponen `empresaId` |
| `src/routes/api/audits/[id]/report/[version]/enviar/+server.ts` | nuevo | POST endpoint con guards y Zod |
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.server.ts` | modificado | `load` expone `empresaEmail` e `informeEnvios` |
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.svelte` | modificado | botón, dialog, toast, lista envíos |
| `src/lib/components/informe/enviar-informe-dialog.svelte` | nuevo | modal de confirmación |
| `tests/email-templates.test.ts` | extendido | describe `envio_informe_cliente template` |
| `tests/informe-enviar.test.ts` | nuevo | schema + listInformeEnvios unitarios |
| `tests/informe-enviado.test.ts` | nuevo | marca derivada de email_log |
| `tests/api/informe-enviar.test.ts` | nuevo | guards, 409, 400, 200, 502 |
| `e2e/envio-informe-email.spec.ts` | nuevo | flujo completo e2e |

## Decisiones de implementación

- `getActiveShareByReport` importado desde `$lib/server/db/informe-shares` (no desde `share.ts` que no lo exporta).
- `getAuditForReport` extendido para incluir `empresaId` — la query ya accede a `audit.empresa_id`.
- La marca "enviado" se filtra por `to_email` de la empresa (sin `report_id` en `email_log` — limitación conocida del design, aceptada).
- Test de 502 usa `vi.mock` de `enviarInforme` para simular `{ ok: false, status: 'fallido' }` sin depender de transporte SMTP.
