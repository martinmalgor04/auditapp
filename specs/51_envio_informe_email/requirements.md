# Requirements — #51 51_envio_informe_email

> Acción **manual** en el backoffice para enviar el informe **aprobado** al contacto del cliente
> por email, sobre el servicio de email #49 y la entrega pública #15. No automática: la dispara
> un usuario (admin o técnico asignado) con confirmación previa y toast de resultado (#38).
>
> **Reuso firme (no reabrir):**
> - **Contrato de email #49 (spec_ready):** `sendEmail(template, to, data)` y la plantilla
>   **reservada `envio_informe_cliente`** (registrada en #49 con `data` =
>   `{ contactoNombre: string; informeUrl: string; pdfUrl?: string }`). Esta feature **define el
>   cuerpo** (asunto, HTML branded SyS, texto plano) de esa plantilla; NO altera el contrato ni la
>   unión `EmailTemplateName`.
> - **Entrega #15 (done):** link público de solo lectura `/informe/[token]`, `resolveShareByToken`,
>   `createReportShare`, `getActiveShareByReport`/`listSharesByReport`, `buildShareUrl`. El informe
>   se envía con un **share activo** (token revocable, no JWT).
> - **PDF #30 (done):** vista de impresión A4 branded en `/informe/[token]/imprimir`.
> - **Contacto cliente #22/#23 (done):** `empresa.email` (entidad unificada), prefill del
>   destinatario.
> - **Branding #11**, **toasts #38**.
>
> Depende de: #49 (`src/lib/server/email/`, `email_log`, `sendEmail`), #15
> (`src/lib/server/informe/share.ts`, `src/lib/server/db/informe-shares.ts`, ruta pública
> `src/routes/informe/[token]/`), #23 (`getEmpresaById`, `audit.empresa_id`), #14
> (`getReportByAuditVersion`, `audit_report`), guards (`requireReportReadAccess`,
> `src/lib/server/api/guards.ts`).
>
> **Decisiones de puerta (Martín, 2026-06-25), spec firme — no reabrir:**
> 1. **Adjunto vs link:** el email lleva el **link público** del informe (#15) como entrega
>    principal y un **link a la versión imprimible/PDF** (`/informe/[token]/imprimir`, #30). **NO se
>    adjunta el binario PDF** (no hay generación server-side de PDF — decisión heredada de #15/#30;
>    el PDF se obtiene desde el navegador con `window.print()`). El campo `pdfUrl?` de la plantilla
>    se rellena con la URL imprimible, no con un adjunto.
> 2. **Marca de "enviado":** se deriva de `email_log` (#49) — NO se crea tabla ni columna nueva. El
>    envío se registra con la plantilla `envio_informe_cliente`; la auditoría muestra "informe
>    enviado (destinatario + fecha)" consultando `email_log`. Migración SQL solo si la consulta de
>    marca lo exigiera (ver design: no se requiere; queda como no-cambio justificado).
> 3. **Disparo manual** con confirmación previa. Reenvío permitido (cada envío deja su fila en
>    `email_log`).

## R1 — Botón "Enviar por mail" habilitado solo con informe aprobado y email de contacto válido

MIENTRAS un usuario autorizado (R6) abre el detalle del informe
(`/auditorias/[id]/informe/[version]`) y el informe está en estado `aprobado` Y la empresa de la
auditoría tiene un `email` con formato válido, el sistema DEBE mostrar el botón "Enviar por mail"
habilitado; SI el informe no está `aprobado` o la empresa no tiene email válido, ENTONCES el botón
NO DEBE estar habilitado (deshabilitado con motivo o ausente).

**Verificación:** `e2e/envio-informe-email.spec.ts` — con informe `aprobado` y empresa con email
válido el botón aparece habilitado; con informe `borrador` o empresa sin email el botón está
deshabilitado/ausente. `tests/api/informe-enviar.test.ts` cubre el guard server-side equivalente
(R2, R5).

## R2 — Envío solo sobre informe aprobado (guard server-side)

CUANDO se recibe una solicitud de envío para un informe que NO está en estado `aprobado`, el
sistema DEBE responder `409` (envelope estándar `apiError`) sin invocar `sendEmail` ni crear share
ni fila en `email_log`.

**Verificación:** `tests/api/informe-enviar.test.ts` — POST de envío sobre informe `borrador`
responde 409; `email_log` sin filas nuevas y `sendEmail` no invocado (mock).

## R3 — Destinatario prefilleado desde el contacto, editable y validado con Zod

CUANDO el usuario abre la acción de envío, el sistema DEBE prefillar el destinatario con
`empresa.email` y aceptar edición; el endpoint de envío DEBE validar el destinatario con Zod
(`z.string().email()`); SI el destinatario no valida, ENTONCES el sistema DEBE responder `400`
(envelope) sin invocar `sendEmail` ni registrar envío.

**Verificación:** `tests/api/informe-enviar.test.ts` — body con `to` ausente o no-email responde
400 sin tocar `sendEmail`; con email válido procede. `tests/informe-enviar.test.ts` — el schema Zod
acepta email válido y rechaza inválido. `e2e/...` — el campo viene prefilleado con el email de la
empresa y es editable.

## R4 — Email branded SyS con link público y link imprimible; sin material interno

CUANDO el sistema procesa un envío válido, el sistema DEBE asegurar un **share activo** del informe
(reusar el activo de #15 si existe, o crear uno con `createReportShare`) y enviar la plantilla
`envio_informe_cliente` (#49) con `informeUrl = buildShareUrl(token)`, `pdfUrl = <informeUrl>/imprimir`
y `contactoNombre` derivado de la empresa; el cuerpo (asunto, HTML, texto) DEBE ser branded SyS
(#11) y NO DEBE contener material interno (`upsell_findings`, `internal_draft`, recomendaciones de
presupuesto, ids internos): solo nombre de contacto, razón social/período y los links.

**Verificación:** `tests/email-templates.test.ts` (extensión) — `EMAIL_TEMPLATES.envio_informe_cliente.render(data)`
produce HTML + texto no vacíos branded SyS que incluyen `informeUrl` y `pdfUrl` y **NO** contienen
ningún texto de un fixture con `upsell_findings`/`internal_draft` (test explícito del acceptance).
`tests/api/informe-enviar.test.ts` — el envío pasa a `sendEmail` un `data` cuyo payload no incluye
campos internos.

## R5 — Guard server-side: solo admin o técnico asignado

CUANDO se recibe una solicitud de envío, el sistema DEBE responder `401` sin sesión válida, `403`
si el usuario no es `admin` ni técnico asignado a la auditoría (reuso de `requireReportReadAccess`
/ patrón asignación efectiva #32/#33), antes de cualquier envío o registro.

**Verificación:** `tests/api/informe-enviar.test.ts` — sin sesión 401; `tecnico` no asignado 403;
`admin` y `tecnico` asignado proceden (200). En todos los rechazos `email_log` sin filas nuevas.

## R6 — Confirmación previa y toast de resultado

CUANDO el usuario pulsa "Enviar por mail", el sistema DEBE pedir confirmación previa (destinatario
visible y editable) antes de enviar; CUANDO el envío resuelve, el sistema DEBE mostrar un toast
(#38) de éxito (con el destinatario) o de error (con mensaje claro) según el resultado.

**Verificación:** `e2e/envio-informe-email.spec.ts` — pulsar el botón abre la confirmación con el
destinatario prefilleado; confirmar dispara el POST y muestra el toast de éxito; un fallo simulado
muestra el toast de error. El toast reusa el componente de #38.

## R7 — Cada envío registrado en email_log; marca "informe enviado" visible; reenvío permitido

CUANDO un envío se procesa (éxito, fallo o dry-run), el sistema DEBE registrar el intento en
`email_log` (#49) vía `sendEmail` con `template = 'envio_informe_cliente'`; la pantalla de detalle
del informe DEBE mostrar "informe enviado" con **destinatario y fecha** del/los envío(s) de esa
plantilla para ese informe; el sistema DEBE permitir reenviar (cada reenvío agrega una fila a
`email_log`).

**Verificación:** `tests/api/informe-enviar.test.ts` — un envío inserta exactamente una fila
`email_log` con `template='envio_informe_cliente'` y el `to_email` enviado; un segundo envío inserta
otra fila. `tests/informe-enviado.test.ts` — `listInformeEnvios(reportId)` (sobre `email_log`)
devuelve destinatario + fecha por envío, ordenados. `e2e/...` — tras enviar, el detalle muestra la
marca "informe enviado".

## R8 — El fallo de envío no rompe la pantalla y se comunica como error

SI `sendEmail` devuelve `status: 'fallido'` (SMTP caído, render inválido) ENTONCES el endpoint DEBE
responder con error de envelope (`apiError`, p.ej. 502) propagando un mensaje genérico al cliente y
el flujo de UI DEBE mostrar el toast de error (R6); el fallo queda registrado en `email_log` por #49
y NO DEBE filtrar detalles internos de SMTP al cliente.

**Verificación:** `tests/api/informe-enviar.test.ts` — con `sendEmail` mockeado devolviendo
`fallido`, el POST responde error con mensaje genérico (sin `SMTP_*`); la fila `email_log` queda
`fallido` (registrada por #49, no por esta feature).

## R9 — Tests unitarios, integración y e2e

El sistema DEBE incluir tests vitest (`tests/informe-enviar.test.ts`, `tests/email-templates.test.ts`
extendido, `tests/informe-enviado.test.ts`, `tests/api/informe-enviar.test.ts`) y e2e
(`e2e/envio-informe-email.spec.ts`) que cubran: guard de estado (R2) y asignación (R5), validación
del destinatario (R3), no-filtrado de material interno (R4), registro en `email_log` y marca de
enviado (R7), manejo de fallo (R8) y el flujo e2e del envío, ejecutables sin SMTP real (dry-run /
transporte mockeado de #49).

**Verificación:** `pnpm test` y `pnpm exec playwright test e2e/envio-informe-email.spec.ts` en
verde sin SMTP externo.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #51) | Requirements |
|---|---|
| Botón "Enviar por mail" solo con informe aprobado y email de contacto válido | R1, R2 |
| Email branded SyS con link público y/o PDF; sin material interno (test explícito) | R4 |
| Destinatario prefilleado desde el contacto, editable, validado Zod | R3 |
| Cada envío en email_log; auditoría muestra "informe enviado" (destinatario + fecha); reenvío | R7 |
| Guard server-side: solo admin o técnico asignado | R5 |
| Confirmación previa y toast de éxito/error (#38) | R6, R8 |
| Tests: guard estado/asignación, no-filtrado interno, email_log, validación, e2e | R9 |

## Fuera de alcance (no implementar)

- Adjuntar el binario PDF al email (decisión de puerta: solo links; sin PDF server-side).
- Modificar el contrato `sendEmail` o la unión `EmailTemplateName` de #49 (solo se completa el
  cuerpo de la plantilla reservada `envio_informe_cliente`).
- Envío del briefing al cliente (#52) y push (#53).
- Programación/automatización del envío (es manual).
- Nueva tabla/columna de "enviado": la marca se deriva de `email_log` (#49).
- Tracking de apertura/clic del email, bounces, plantillas editables en DB.
