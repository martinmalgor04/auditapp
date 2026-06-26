# Requirements — #49 49_servicio_email

> Fundación de envío de email para toda la app, sobre **SMTP genérico vía nodemailer**,
> configurable 100% por `.env`, apto self-hosted (Dokploy #10) con el correo corporativo de SyS.
> Define el contrato público `sendEmail(template, to, data)` que reusan #50 (recuperar
> contraseña), #51 (informe por mail), #52 (briefing por mail) y los avisos de #53 (push).
> Primer consumidor real: **avisos internos automáticos a técnicos/admin** en **cinco eventos** del
> ciclo de auditoría (auditoría asignada, briefing completado, informe aprobado, **auditoría cerrada**,
> **feedback del cliente** — respuesta a la encuesta de conformidad #47).
>
> **Decisiones de puerta (Martín, 2026-06-25), spec firme — no reabrir:**
> 1. Proveedor: **SMTP genérico (nodemailer)**, configurable por `.env` (host, port, user, pass,
>    from). Self-hosted, correo corporativo SyS. **NO SaaS** (no SendGrid/SES/Resend).
> 2. Eventos automáticos de esta feature: **avisos internos** (no envíos al cliente). Los envíos
>    al cliente son #51/#52.
> 3. **Modo dry-run en dev/test:** no se envían correos reales; se renderiza el payload y se
>    registra en `email_log` con estado `dry_run`. Los tests verifican el payload renderizado.
> 4. **Remitente (RESUELTA):** `From` por defecto `auditorias@serviciosysistemas.com.ar`,
>    configurable por `.env` (`SMTP_FROM`).
> 5. **Base URL de links (RESUELTA):** se reusa `env.PUBLIC_APP_URL` (ya existente, usado por
>    `src/lib/server/informe/share.ts`). NO se crea variable nueva para esto.
> 6. **Eventos internos = 5 (RESUELTA):** se suman **auditoría cerrada** y **feedback del cliente**
>    a los tres iniciales (asignada, briefing completado, informe aprobado).
> 7. **Destinatarios (RESUELTA):** "admin involucrado" = `audit.created_by` si es admin; si
>    `created_by` NO es admin → fallback a TODOS los admins activos. Los técnicos asignados
>    (`audit_assignment`, #20/#32/#33) reciben los eventos que les conciernen. Ver R11.
> 8. **Opt-out por canal (RESUELTA):** `app_user.notify_internal_email` (email) se edita desde el
>    perfil (#48); la preferencia de push (`notify_push`) la crea #53. Ambas son toggles por canal.
>
> Depende de: `01_stack_scaffolding` (#1, done) — `src/lib/server/env.ts` (config Zod por `.env`),
> `src/lib/server/logger.ts` (logs estructurados con redacción de claves sensibles); `02_modelo_datos`
> (#2, done) — runner de migraciones `src/lib/server/db/migrate.ts`, patrón `migrations/NNN_*.sql`;
> `11_ui_branding_sys` (#11) — tokens de marca SyS para plantillas HTML; `20_audit_assignment`/`33`
> (assignment efectivo, `src/lib/server/db/audit-assignment.ts`); `15_entrega_informe` (#15) —
> `approveReport` (`src/lib/server/db/informe-reports.ts`); `05_briefing_externo` (#5) —
> `submitBriefing` (`src/lib/server/briefing/submit.ts`). NO incluye recuperación de contraseña
> (#50), envío de informe/briefing al cliente (#51/#52) ni push (#53).

## Contrato público (decisión firme — referenciado por #50/#51/#52/#53)

```typescript
// src/lib/server/email/index.ts — contrato estable, reusable
export type EmailTemplateName =
  | 'aviso_auditoria_asignada'   // #49
  | 'aviso_briefing_completado'  // #49
  | 'aviso_informe_aprobado'     // #49
  | 'aviso_auditoria_cerrada'    // #49 (nuevo, 2026-06-25)
  | 'aviso_feedback_cliente'     // #49 (nuevo, 2026-06-25)
  | 'password_reset'             // #50 (plantilla registrada aquí; cuerpo en #50)
  | 'envio_informe_cliente'      // #51
  | 'envio_briefing_cliente';    // #52

export async function sendEmail<T extends EmailTemplateName>(
  template: T,
  to: string | string[],
  data: EmailTemplateData[T]
): Promise<EmailSendResult>;
```

- `template`: nombre de plantilla registrada (unión cerrada arriba).
- `to`: uno o varios destinatarios (cada uno valida formato email Zod antes de enviar).
- `data`: payload **tipado por plantilla** y validado con Zod (`EmailTemplateData[template]`).
- Devuelve `EmailSendResult` `{ status: 'enviado' | 'fallido' | 'dry_run'; logIds: string[]; error?: string }`.
- **Nunca lanza** por fallo de SMTP: captura el error, lo registra en `email_log` con estado
  `fallido` y lo devuelve en el resultado (el llamador decide si degrada o reintenta).

## Nombres de plantilla (registro central)

| Plantilla | Feature | Datos clave | Estado en #49 |
|---|---|---|---|
| `aviso_auditoria_asignada` | #49 | técnico, referencia auditoría, cliente, link backoffice | Implementada |
| `aviso_briefing_completado` | #49 | auditoría, cliente, link backoffice | Implementada |
| `aviso_informe_aprobado` | #49 | auditoría, cliente, versión, link backoffice | Implementada |
| `aviso_auditoria_cerrada` | #49 | auditoría, cliente, link backoffice | Implementada |
| `aviso_feedback_cliente` | #49 | auditoría, cliente, valoración global, link backoffice | Implementada |
| `password_reset` | #50 | nombre, link `/reset/[token]`, expiración | **Reservada** (cuerpo en #50) |
| `envio_informe_cliente` | #51 | contacto, link público `/informe/[token]`, opcional PDF | **Reservada** (#51) |
| `envio_briefing_cliente` | #52 | contacto, link `/briefing/[token]`, explicación | **Reservada** (#52) |

En #49 se implementan las cinco `aviso_*`. Las reservadas existen como entradas del registro
de plantillas con su schema declarado para que #50/#51/#52 las completen sin tocar el contrato.

## R1 — Configuración SMTP 100% por `.env`, validada al arranque

El sistema DEBE extender `serverEnvSchema` (`src/lib/server/env.ts`) con las variables SMTP
(`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`) como opcionales
(patrón `optionalString`/`emptyToUndefined` ya existente), de modo que el arranque en dev local
sin SMTP configurado NO falle. El remitente efectivo DEBE ser `SMTP_FROM` si está presente y, si
falta, el default `auditorias@serviciosysistemas.com.ar` (decisión de puerta 4). Los links de los
correos DEBEN construirse sobre `env.PUBLIC_APP_URL` (ya existente, decisión de puerta 5); NO se
agrega variable nueva para la base URL.

**Verificación:** `tests/email-config.test.ts` — `serverEnvSchema` parsea con las vars SMTP
ausentes (no lanza) y con valores válidos; con `SMTP_FROM` ausente el remitente resuelto es
`auditorias@serviciosysistemas.com.ar`, y con `SMTP_FROM` presente usa ese valor; `.env.example`
lista las seis vars sin secretos (placeholders con `<...>`).

## R2 — Modo dry-run en dev/test: no se envían correos reales

MIENTRAS el SMTP no está configurado (falta `SMTP_HOST`) o `NODE_ENV` no es `production`, el
sistema DEBE operar en **modo dry-run**: render del payload completo (asunto, HTML, texto plano,
destinatarios) SIN abrir conexión SMTP ni enviar, devolviendo `status: 'dry_run'`.

**Verificación:** `tests/email-client.test.ts` — con SMTP ausente, `sendEmail(...)` no invoca el
transporte nodemailer (transport mockeado/no instanciado), devuelve `dry_run` y el payload
renderizado (asunto/HTML/texto) es inspeccionable en el resultado.

## R3 — Cliente SMTP real cuando hay configuración y entorno productivo

CUANDO el SMTP está configurado (`SMTP_HOST` presente) y `NODE_ENV === 'production'`, el sistema
DEBE enviar el correo vía nodemailer usando host/port/secure/auth de `.env` y el remitente
`SMTP_FROM`, devolviendo `status: 'enviado'` al aceptar el servidor SMTP.

**Verificación:** `tests/email-client.test.ts` — con SMTP configurado y `NODE_ENV=production` y un
transporte nodemailer mockeado, `sendEmail(...)` llama `transport.sendMail` con `from`, `to`,
`subject`, `html` y `text`, y devuelve `enviado` cuando el mock resuelve.

## R4 — Reintento básico ante fallo transitorio de SMTP

CUANDO el envío SMTP falla con un error transitorio, el sistema DEBE reintentar hasta un máximo
acotado (constante `EMAIL_MAX_ATTEMPTS`, p.ej. 3) con backoff simple antes de marcar el envío
como fallido.

**Verificación:** `tests/email-client.test.ts` — un transporte que falla N−1 veces y luego
resuelve termina en `enviado`; uno que falla siempre termina en `fallido` tras exactamente
`EMAIL_MAX_ATTEMPTS` intentos.

## R5 — Plantillas branded SyS: HTML + texto plano, datos tipados Zod

El sistema DEBE renderizar cada plantilla a un par **HTML branded SyS + texto plano**, validando
los `data` con un schema Zod por plantilla antes de renderizar; SI los `data` no validan ENTONCES
`sendEmail` DEBE devolver `status: 'fallido'` con error de validación y NO DEBE abrir conexión
SMTP ni registrar un intento `enviado`.

**Verificación:** `tests/email-templates.test.ts` — cada plantilla `aviso_*` con datos válidos
produce HTML (con tokens de marca SyS) y texto plano no vacíos que incluyen los campos del
payload; con datos inválidos `sendEmail` devuelve `fallido` sin tocar el transporte.

## R6 — Migración SQL idempotente crea `email_log`

El sistema DEBE incluir la migración `0NN_servicio_email.sql` (0NN = siguiente número disponible
al implementar; va después de `025_encuesta_conformidad.sql`) que crea la tabla `email_log`
(destinatario, plantilla, estado, error, timestamps) con `CREATE TABLE IF NOT EXISTS` e índices
`IF NOT EXISTS`, re-ejecutable sin error.

**Verificación:** `tests/email-schema.test.ts` — aplicar la migración dos veces no falla; la tabla
`email_log` existe con las columnas y el `CHECK` de estado declarados en design §Schema.

## R7 — Cada intento de envío se registra en `email_log`

CUANDO `sendEmail` procesa un destinatario (enviado, fallido o dry-run), el sistema DEBE insertar
una fila en `email_log` con `to_email`, `template`, `status` (`enviado` | `fallido` | `dry_run`),
`error` (NULL salvo fallo), `created_at` y `sent_at` (NULL salvo `enviado`).

**Verificación:** `tests/email-log.test.ts` — un envío dry-run inserta una fila `dry_run` con
`error` NULL y `sent_at` NULL; un envío fallido inserta `fallido` con `error` no nulo; un envío
exitoso (mock) inserta `enviado` con `sent_at` no nulo. Un `to` con N destinatarios inserta N
filas.

## R8 — Aviso interno automático: auditoría asignada

CUANDO se asignan técnicos a una auditoría (alta/edición de asignación, `insertAuditAssignments`
vía `createAudit`/`updateAudit` en `src/lib/server/backoffice/audits.ts`), el sistema DEBE enviar
`aviso_auditoria_asignada` a cada técnico **recién asignado** que tenga email y no esté en opt-out
(R12), con la referencia de la auditoría y el cliente.

**Verificación:** `tests/email-eventos.test.ts` — asignar dos técnicos dispara dos envíos
(`aviso_auditoria_asignada`) a sus emails; re-guardar la misma asignación sin cambios no reenvía
a quien ya estaba asignado; un técnico sin email o en opt-out no recibe.

## R9 — Aviso interno automático: briefing completado

CUANDO el briefing externo de una auditoría pasa a `briefing_completo` (`submitBriefing`,
`src/lib/server/briefing/submit.ts`), el sistema DEBE enviar `aviso_briefing_completado` a los
técnicos asignados a esa auditoría (assignment efectivo #20/#33) y al admin, según destinatarios
de R11, omitiendo opt-out.

**Verificación:** `tests/email-eventos.test.ts` — completar el briefing de una auditoría con dos
técnicos asignados dispara `aviso_briefing_completado` a esos técnicos; una segunda llamada a
`submitBriefing` sobre una auditoría ya `briefing_completo` (early-return existente) no reenvía.

## R10 — Aviso interno automático: informe aprobado

CUANDO un informe pasa a `aprobado` (`approveReport`, `src/lib/server/db/informe-reports.ts`), el
sistema DEBE enviar `aviso_informe_aprobado` a los técnicos asignados a la auditoría y al admin,
según destinatarios de R11, omitiendo opt-out.

**Verificación:** `tests/email-eventos.test.ts` — aprobar un informe dispara
`aviso_informe_aprobado` a los técnicos asignados de la auditoría correspondiente.

## R11 — Selección de destinatarios: admin involucrado + técnicos asignados (RESUELTA)

El sistema DEBE resolver los destinatarios de cada aviso interno combinando: **(a) el admin
involucrado** = `audit.created_by` si ese usuario es admin activo; si `created_by` NO es admin
ENTONCES fallback a **TODOS los admins activos**; y **(b) los técnicos asignados** a la auditoría
(`audit_assignment`, #20/#32/#33), según el evento (R8 dirige a técnico recién asignado + admin
involucrado; R9/R10/R16/R17 dirigen a admin involucrado + técnicos asignados). El resultado DEBE
ser de **userIds únicos** (deduplicados), excluyendo usuarios inactivos, sin email o en opt-out
(R12). `resolveInternalRecipientUserIds(auditId, evento)` DEBE devolver **userIds** (no emails)
para que #53 (push) reuse exactamente la misma selección; el envío de email resuelve los emails a
partir de esos userIds.

**Verificación:** `tests/email-eventos.test.ts` — con `created_by` admin, `resolveInternalRecipientUserIds`
incluye ese admin + los técnicos asignados, deduplicados, sin inactivos ni opt-out; con `created_by`
NO admin, incluye todos los admins activos (fallback) + técnicos asignados; si la auditoría no tiene
técnicos asignados, solo notifica al/los admin(s).

## R12 — Opt-out por canal: email editable desde el perfil

El sistema DEBE persistir una preferencia de opt-out de avisos internos por **canal email** por
usuario (columna `app_user.notify_internal_email`, default `true`), **editable desde el perfil
(#48)**, y SI un usuario tiene la preferencia en `false` ENTONCES NO DEBE incluirlo como
destinatario de avisos internos por email (R8–R10, R16, R17). La preferencia de **canal push**
(`notify_push`) la crea #53; ambas son toggles por canal en el perfil. #49 solo crea y respeta
`notify_internal_email`.

**Verificación:** `tests/email-eventos.test.ts` — un usuario con `notify_internal_email = false`
no aparece en `resolveInternalRecipientUserIds` para el canal email y no recibe ninguno de los
cinco avisos.

## R13 — Los avisos internos nunca rompen la operación que los dispara

SI un aviso interno falla al enviarse (SMTP caído, error de render) ENTONCES el sistema DEBE
registrar el fallo (en `email_log` y/o `logger.error`) y permitir que la operación de negocio que
lo disparó (asignar, completar briefing, aprobar informe) **complete con éxito** igualmente; el
aviso NO DEBE propagar la excepción al flujo principal.

**Verificación:** `tests/email-eventos.test.ts` — con un transporte que siempre falla, aprobar un
informe / completar briefing / asignar técnico completa sin lanzar; el fallo queda en `email_log`
como `fallido`.

## R14 — Logs sin secretos ni cuerpo sensible

El sistema DEBE loguear los envíos vía `logger` sin exponer `SMTP_PASS`, el HTML completo del
correo ni datos sensibles (reusa la redacción de claves de `logger.ts`).

**Verificación:** `tests/email-client.test.ts` — los logs emitidos durante un envío no contienen
el valor de `SMTP_PASS` (clave `pass`/`password` redactada por el logger).

## R15 — Tests unitarios e integración

El sistema DEBE incluir tests vitest (`tests/email-config.test.ts`, `tests/email-client.test.ts`,
`tests/email-templates.test.ts`, `tests/email-schema.test.ts`, `tests/email-log.test.ts`,
`tests/email-eventos.test.ts`) que cubran render de plantillas, registro en `email_log`, dry-run,
reintento, selección de destinatarios por evento, opt-out y manejo de fallo, ejecutables sin
servidor SMTP real (transporte mockeado/dry-run).

**Verificación:** `pnpm test` ejecuta la suite de email en verde sin SMTP externo.

## R16 — Aviso interno automático: auditoría cerrada

CUANDO una auditoría pasa a `cerrada` (confirmación de cierre de #08, transición `en_cierre → cerrada`
en el action de `src/routes/(app)/auditorias/[id]/cierre/+page.server.ts`, validada por
`audit-status.ts`), el sistema DEBE enviar `aviso_auditoria_cerrada` a los destinatarios de R11
(admin involucrado + técnicos asignados), omitiendo opt-out (R12), con la referencia de la auditoría
y el cliente.

**Verificación:** `tests/email-eventos.test.ts` — confirmar el cierre de una auditoría dispara
`aviso_auditoria_cerrada` al/los admin(s) y técnicos asignados; reabrir y re-cerrar dispara de nuevo;
una llamada que no produce transición real a `cerrada` no envía.

## R17 — Aviso interno automático: feedback del cliente (encuesta #47)

CUANDO el cliente responde la encuesta de conformidad (#47) y se persiste la respuesta
(`insertSurveyResponse` vía la capa de dominio `src/lib/server/informe/survey.ts`), el sistema DEBE
enviar `aviso_feedback_cliente` a los destinatarios de R11 (admin involucrado + técnicos asignados),
omitiendo opt-out (R12), incluyendo la `valoracion_global` y la referencia de la auditoría/cliente,
sin exponer material interno. El disparo se engancha tras la inserción exitosa de la respuesta
(idempotente: una respuesta por share, por lo que no hay reenvío en re-submits rechazados).

**Verificación:** `tests/email-eventos.test.ts` — registrar una respuesta de encuesta dispara
`aviso_feedback_cliente` con la valoración al/los admin(s) y técnicos asignados; un segundo intento
de responder el mismo share (rechazado por el índice único de #47) no reenvía.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #49) | Requirements |
|---|---|
| Módulo email server-side con cliente SMTP configurable 100% por `.env`; `.env.example` sin secretos | R1, R3, R4 |
| Modo dry-run en dev/test: no se envían correos reales; tests verifican payload renderizado | R2, R15 |
| Plantillas branded SyS (HTML + texto plano) con datos Zod; al menos las de avisos internos | R5 |
| Migración idempotente crea `email_log` y registra cada intento | R6, R7 |
| Avisos internos automáticos en los cinco eventos, dirigidos según asignación | R8, R9, R10, R16, R17, R11, R12 |
| Contrato `sendEmail(template, to, data)` reutilizable y documentado para #50/#51/#52 | Contrato §, R5 |
| Tests: render, registro en `email_log`, dry-run, selección de destinatarios, manejo de fallo | R7, R8–R13, R15 |

## Fuera de alcance (no implementar)

- Recuperación de contraseña (#50): solo se **reserva** la plantilla `password_reset`.
- Envío de informe/briefing al cliente (#51/#52): plantillas `envio_*` reservadas, sin UI ni envío.
- Notificaciones push PWA (#53): la selección de destinatarios (R11) queda lista para reuso.
- Cola de reintento persistente / worker en background: el reintento de R4 es in-proceso acotado.
- Centro de preferencias de notificación rico: solo el opt-out booleano mínimo de R12.
- Tracking de apertura/clic, bounces, listas, plantillas editables en DB.
