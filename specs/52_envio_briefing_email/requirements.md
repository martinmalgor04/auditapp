# Requirements — #52 52_envio_briefing_email

> Acción **manual** en el backoffice para enviar el link de briefing externo (#5)
> al contacto del cliente por email, usando el servicio de email #49. El botón vive
> en el detalle de la auditoría, junto a la generación/copia del `public_token` (#4).
> Disparo **manual** (no automático). El envío NO altera el estado de la auditoría
> (no toca la máquina de estados de #4/#5): solo registra una marca de "briefing enviado".
>
> Depende de (specs vivos):
> - `49_servicio_email` (#49, spec_ready) — contrato `sendEmail(template, to, data)`,
>   plantilla **reservada** `envio_briefing_cliente` (cuyo cuerpo se define aquí),
>   tabla `email_log` y su helper `insertEmailLog` (`src/lib/server/db/email-log.ts`).
> - `05_briefing_externo` (#5, done) — ruta pública `/briefing/[token]`, vigencia de
>   token (`token_expires_at`, estados `briefing_enviado`/`briefing_completo`).
> - `04_backoffice` (#4, done) — generación de `public_token`,
>   `getBriefingUrl(publicToken)` y `canShowBriefingLink(status, publicToken)`
>   (`src/lib/server/backoffice/briefing-link.ts`); detalle de auditoría
>   (`src/routes/(app)/auditorias/[id]/+page.server.ts`).
> - `22_cab_contacto_cliente` (#22, done) / `23_crm_empresa_unificada` (#23, done) —
>   contacto del cliente: `empresa.email` (y `referente_nombre`/`referente_contacto`).
> - `11_ui_branding_sys` (#11) — branding SyS de la plantilla (reusa `layout.ts` de #49).
> - `38_toast_error_guardado` (#38, done) — patrón de toast de éxito/error.

## Decisiones de puerta heredadas (no reabrir)

- Proveedor de email: **SMTP genérico (nodemailer)**, dry-run en dev/test (de #49).
- El cuerpo del email **no** abre conexión SMTP en dry-run; los tests verifican el payload.

## Plantilla a completar (registrada en #49 como reservada)

`envio_briefing_cliente` — datos `{ contactoNombre: string; briefingUrl: string }`
(ver `EmailTemplateData` en `src/lib/server/email/index.ts`). En #52 se define su
`render(data) → { subject, html, text }`; el contrato y el `schema` Zod ya existen en #49.

## R1 — Botón "Enviar briefing por mail" en el detalle de la auditoría

El sistema DEBE mostrar, en el detalle de la auditoría
(`src/routes/(app)/auditorias/[id]/`) y junto a la acción de link de briefing, un
control "Enviar briefing por mail".

**Verificación:** `e2e/envio-briefing-email.spec.ts` — el detalle de una auditoría con
token de briefing vigente y contacto con email muestra el control "Enviar briefing por mail".

## R2 — Habilitación: token vigente + contacto con email

MIENTRAS la auditoría tiene `public_token` y estado que habilita briefing
(`canShowBriefingLink(status, publicToken) === true`, es decir
`briefing_enviado` o `briefing_completo`) **y** el contacto del cliente tiene un
email no vacío, el sistema DEBE habilitar el control "Enviar briefing por mail";
en cualquier otro caso DEBE deshabilitarlo.

**Verificación:** `tests/envio-briefing-email-enable.test.ts` — matriz: con token vigente
y email → habilitado; sin token, en `borrador`/`cerrada`, o sin email del contacto →
deshabilitado.

## R3 — Plantilla branded SyS con el link y explicación breve

El sistema DEBE renderizar la plantilla `envio_briefing_cliente` a un par
**HTML branded SyS + texto plano** que incluya el link `/briefing/[token]`
(`briefingUrl`), el saludo al contacto (`contactoNombre`) y una explicación breve de
qué se le pide al cliente, validando `data` con el schema Zod de la plantilla (#49).

**Verificación:** `tests/envio-briefing-email-template.test.ts` — `render` con datos
válidos produce HTML (con tokens de marca SyS) y texto plano no vacíos que contienen
`briefingUrl` y `contactoNombre`; datos inválidos hacen que `sendEmail` devuelva
`status: 'fallido'` sin abrir SMTP.

## R4 — Destinatario prefilleado desde el contacto, editable y validado Zod

CUANDO el usuario abre la acción de envío, el sistema DEBE prefilear el destinatario
con el email del contacto del cliente (`empresa.email`) y permitir editarlo; al
enviar, el sistema DEBE validar el destinatario con Zod (`z.string().email()`) y, SI
el email no es válido, ENTONCES DEBE rechazar el envío con error de validación (400 /
`fail`) sin invocar `sendEmail` ni registrar en `email_log`.

**Verificación:** `tests/api/envio-briefing-email-send.test.ts` — el destinatario llega
prefilleado con `empresa.email`; un email inválido devuelve error de validación sin
fila en `email_log`; un email editado válido se usa como destinatario.

## R5 — Envío vía `sendEmail` y registro en `email_log`

CUANDO el envío se confirma con destinatario válido, el sistema DEBE invocar
`sendEmail('envio_briefing_cliente', destinatario, { contactoNombre, briefingUrl })`
(#49), que registra el intento en `email_log` con su `status`
(`enviado` | `fallido` | `dry_run`).

**Verificación:** `tests/api/envio-briefing-email-send.test.ts` — en dry-run, confirmar
el envío inserta una fila `email_log` con `template = 'envio_briefing_cliente'` y
`status = 'dry_run'`; el `briefingUrl` del payload apunta a `/briefing/{public_token}`.

## R6 — Marca de "briefing enviado" visible (destinatario + fecha)

CUANDO un envío se procesa (no `fallido`), el sistema DEBE persistir y mostrar en el
detalle de la auditoría una marca "briefing enviado" con el último destinatario y la
fecha del envío.

**Verificación:** `tests/api/envio-briefing-email-send.test.ts` — tras un envío exitoso,
el detalle expone `briefingEmail.sentTo` y `briefingEmail.sentAt`;
`e2e/envio-briefing-email.spec.ts` — el detalle muestra "Briefing enviado a {email} el {fecha}".

## R7 — Reenvío permitido

CUANDO ya existe una marca de "briefing enviado", el sistema DEBE permitir reenviar el
link; cada reenvío DEBE registrar una nueva fila en `email_log` y actualizar la marca
(destinatario + fecha) al último envío.

**Verificación:** `tests/api/envio-briefing-email-send.test.ts` — dos envíos sucesivos
generan dos filas `email_log`; la marca refleja el destinatario y la fecha del segundo.

## R8 — Guard server-side: solo admin o técnico asignado

SI la acción de envío la ejecuta un usuario que no es `admin` ni el técnico asignado
(asignación efectiva #33) a la auditoría, ENTONCES el sistema DEBE rechazar la acción
(403) sin invocar `sendEmail` ni modificar la marca de enviado.

**Verificación:** `tests/api/envio-briefing-email-send.test.ts` — `admin` y técnico
asignado envían con éxito; un técnico no asignado recibe 403 sin fila en `email_log`.

## R9 — El envío NO altera el estado de la auditoría (salvo la marca)

CUANDO se envía el briefing por mail, el sistema NO DEBE modificar `audit.status` ni
`public_token`; el único efecto persistente sobre la auditoría DEBE ser la marca de
"briefing enviado" (R6).

**Verificación:** `tests/api/envio-briefing-email-send.test.ts` — `status` y
`public_token` de la auditoría son idénticos antes y después del envío.

## R10 — Confirmación previa + toast de resultado

CUANDO el usuario activa el control, el sistema DEBE pedir confirmación previa
(mostrando el destinatario) y, tras procesar, DEBE mostrar un toast (#38) de éxito o
de error según el resultado de `sendEmail`.

**Verificación:** `e2e/envio-briefing-email.spec.ts` — el flujo abre confirmación con el
destinatario, y al confirmar muestra el toast de éxito (dry-run cuenta como éxito).

## R11 — Marca de enviado: migración idempotente solo si hace falta

DONDE la persistencia de la marca de "briefing enviado" (R6) requiera columnas nuevas
en `audit`, el sistema DEBE incluir una migración SQL idempotente
(`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) que las cree, posterior a las migraciones
de #49/#50/#51; SI la marca puede derivarse de `email_log` (#49) sin columnas nuevas,
ENTONCES NO DEBE añadirse migración.

**Verificación:** `tests/envio-briefing-email-schema.test.ts` — si la migración existe,
aplicarla dos veces no falla y las columnas existen; si no existe, la marca (R6) se
deriva de `email_log` por `(audit_id/template, último envío)` y el test la consulta.
Ver design §"Decisión de marca".

## R12 — Tests unitarios, integración y e2e

El sistema DEBE incluir tests vitest
(`tests/envio-briefing-email-enable.test.ts`, `tests/envio-briefing-email-template.test.ts`,
`tests/api/envio-briefing-email-send.test.ts`, y `tests/envio-briefing-email-schema.test.ts`
si aplica R11) más un e2e (`e2e/envio-briefing-email.spec.ts`), ejecutables sin SMTP real
(dry-run / transporte mockeado de #49).

**Verificación:** `pnpm test` y `pnpm exec playwright test e2e/envio-briefing-email.spec.ts`
en verde sin SMTP externo.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #52) | Requirements |
|---|---|
| Botón "Enviar briefing por mail" habilitado con token vigente y email de contacto | R1, R2 |
| Email branded SyS con link `/briefing/[token]` y explicación breve | R3, R5 |
| Destinatario prefilleado desde el contacto, editable y validado Zod | R4 |
| Cada envío en `email_log`; auditoría muestra "briefing enviado" (dest. + fecha); reenvío | R5, R6, R7, R11 |
| Guard admin/técnico asignado; envío no altera estado salvo marca de enviado | R8, R9 |
| Confirmación previa + toast (#38) | R10 |
| Tests: guard, validación de destinatario, registro en `email_log`, e2e | R12 (+ R4, R5, R8) |

## Fuera de alcance (no implementar)

- Envío automático/programado del briefing (esto es disparo manual).
- Recordatorios o reenvíos automáticos (n8n) — quedan para v2.
- Envío del informe al cliente (#51) y recuperación de contraseña (#50).
- Tracking de apertura/clic, bounces o adjuntos en el email de briefing.
- Cambios a la máquina de estados de briefing (#4/#5).
