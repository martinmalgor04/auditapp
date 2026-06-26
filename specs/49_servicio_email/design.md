# Design — #49 49_servicio_email

## Alcance

Módulo de email server-side `src/lib/server/email/` sobre **nodemailer + SMTP genérico**,
configurable por `.env`. Render branded SyS (HTML + texto), datos tipados Zod, log de envíos en
`email_log`, dry-run en dev/test, reintento básico. Primer consumidor: **avisos internos** en cinco
eventos (asignación, briefing completado, informe aprobado, auditoría cerrada, feedback del cliente
#47). Define `sendEmail(template, to, data)` para reuso por #50/#51/#52/#53.

| Incluido (MVP) | Excluido |
|---|---|
| Cliente SMTP nodemailer (host/port/user/pass/from/secure por `.env`) | Proveedores SaaS (SendGrid/SES/Resend) |
| `sendEmail(template, to, data)` tipado, dry-run, reintento (R1–R5) | Cola persistente / worker background |
| Registro de plantillas: 5 `aviso_*` implementadas + 3 reservadas (#50/#51/#52) | Cuerpos de plantillas reservadas |
| Tabla `email_log` + registro por intento (R6, R7) | Tracking apertura/clic, bounces |
| Avisos internos en 3 eventos, destinatarios por asignación (R8–R11) | Envíos al cliente (#51/#52), push (#53) |
| Opt-out booleano por usuario (R12) | Centro de preferencias rico |

## Dependencias

| Feature | Contrato usado |
|---|---|
| `01_stack_scaffolding` (#1) | `serverEnvSchema` + `optionalString`/`emptyToUndefined` (`src/lib/server/env.ts`); `logger` con redacción de claves (`src/lib/server/logger.ts`) |
| `02_modelo_datos` (#2) | Runner `runMigrations` (`src/lib/server/db/migrate.ts`), patrón `migrations/NNN_*.sql`, `sql` cliente postgres.js |
| `11_ui_branding_sys` (#11) | Tokens de marca SyS (colores/tipografía) embebidos inline en el HTML del email |
| `20_audit_assignment`/`33` | `listAuditAssignments(auditId)`, `AuditAssignment` (`src/lib/server/db/audit-assignment.ts`) |
| `15_entrega_informe` (#15) | `approveReport(id, approvedBy)` (`src/lib/server/db/informe-reports.ts`) — punto de enganche del aviso |
| `05_briefing_externo` (#5) | `submitBriefing(token)` (`src/lib/server/briefing/submit.ts`) — punto de enganche del aviso |
| usuarios (#3) | `findUserById`, `AppUser` (`email`, `name`, `role`, `active`) (`src/lib/server/db/users.ts`) |

## Arquitectura

```
Llamador (evento o feature futura)
   sendEmail(template, to, data)                              src/lib/server/email/index.ts
        │
        ├─ EMAIL_TEMPLATES[template].schema.safeParse(data)   (R5) → fallo ⇒ status 'fallido'
        ├─ render → { subject, html, text }                  (R5, branded SyS)
        ├─ normaliza/valida destinatarios (Zod email)        (R1)
        └─ por cada destinatario:
             modo dry-run? (sin SMTP_HOST o NODE_ENV!=prod)  (R2) → log 'dry_run'
             enviar vía transport (nodemailer) con reintento (R3, R4)
                 éxito → log 'enviado' (sent_at)             (R7)
                 fallo tras N intentos → log 'fallido'+error (R4, R7)
             nunca lanza al llamador                          (R13 lo aprovecha)

Eventos internos                                              src/lib/server/email/notify.ts
   onAuditoriaAsignada(auditId, nuevosTechIds)  (R8)
   onBriefingCompletado(auditId)                (R9)
   onInformeAprobado(auditId, reportId, version)(R10)
        └─ resolveInternalRecipientUserIds(auditId, evento)  (R11) → userIds únicos (admin involucrado + técnicos asignados), sin inactivos/opt-out (R12); emails resueltos desde userIds
        └─ sendEmail('aviso_*', emails, data)    (try/catch → R13)

Puntos de enganche (call sites existentes):
   backoffice/audits.ts createAudit/updateAudit  → tras insertAuditAssignments → onAuditoriaAsignada
   briefing/submit.ts submitBriefing             → tras updateAuditStatus('briefing_completo') → onBriefingCompletado
   db/informe-reports.ts approveReport (o su action) → tras approve → onInformeAprobado
```

**Decisión de enganche:** los avisos se disparan desde la **capa de dominio/backoffice** (no
desde componentes Svelte). Para `informe aprobado`, el disparo va en la **form action / servicio**
que llama `approveReport`, no dentro de la función DB pura, para no acoplar la capa `db/` a email
y mantener la separación de capas de `docs/architecture.md`. Idem briefing (en `submitBriefing`,
que ya es dominio) y asignación (en `backoffice/audits.ts`, tras la transacción).

## Cambios de schema — migración `0NN_servicio_email.sql`

(0NN = siguiente número disponible al implementar; va después de `025_encuesta_conformidad.sql`.)

### `email_log`

| Col | Tipo | Notas |
|---|---|---|
| id | uuid PK default `gen_random_uuid()` | |
| to_email | text NOT NULL | destinatario único (una fila por destinatario) (R7) |
| template | text NOT NULL | nombre de plantilla (`EmailTemplateName`) |
| status | text NOT NULL CHECK (in 'enviado','fallido','dry_run') | resultado del intento (R7) |
| error | text | NULL salvo `fallido` |
| created_at | timestamptz NOT NULL DEFAULT now() | momento del intento |
| sent_at | timestamptz | NULL salvo `enviado` |

```sql
CREATE TABLE IF NOT EXISTS email_log (...);
CREATE INDEX IF NOT EXISTS email_log_template_idx ON email_log (template);
CREATE INDEX IF NOT EXISTS email_log_created_idx   ON email_log (created_at);

-- Opt-out de avisos internos por usuario (R12). Idempotente.
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS notify_internal_email boolean NOT NULL DEFAULT true;
```

Idempotente (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), re-ejecutable. Sin `archived_at`:
`email_log` es append-only (constancia de auditoría); no se borra.

## Archivos a crear/modificar

### Config

| Archivo | Propósito |
|---|---|
| `src/lib/server/env.ts` (extender) | Añadir a `serverEnvSchema`: `SMTP_HOST` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` (`optionalString`), `SMTP_PORT` (opcional numérico coercible), `SMTP_SECURE` (opcional bool coercible). Todas opcionales → dev sin SMTP no rompe (R1) |
| `.env.example` (extender) | Bloque `# ── Email (SMTP, #49) ──` con las seis vars y placeholders `<...>`, sin secretos (R1) |

### Migración y DB

| Archivo | Propósito |
|---|---|
| `migrations/0NN_servicio_email.sql` (nuevo) | `email_log` + índices + columna `app_user.notify_internal_email` (R6, R12) |
| `src/lib/server/db/email-log.ts` (nuevo) | `insertEmailLog(input)`, `listEmailLogByTemplate(...)` (auditoría/reintento) (R7) |
| `src/lib/server/db/users.ts` (extender) | `findInternalRecipients(auditId)` o helper en notify que reusa `listAuditAssignments` + lookup de emails respetando `active` y `notify_internal_email` (R11, R12) |

### Módulo email

| Archivo | Propósito |
|---|---|
| `src/lib/server/email/index.ts` (nuevo) | Contrato público `sendEmail`, tipos `EmailTemplateName`, `EmailTemplateData`, `EmailSendResult`; orquesta validación Zod → render → dry-run/envío → log |
| `src/lib/server/email/transport.ts` (nuevo) | Crea/cachea el transport nodemailer desde `.env`; `isDryRun()` (sin `SMTP_HOST` o `NODE_ENV!=='production'`); `sendWithRetry(message)` con `EMAIL_MAX_ATTEMPTS` y backoff (R2, R3, R4). El transport se inyecta/mockea en tests |
| `src/lib/server/email/templates.ts` (nuevo) | Registro `EMAIL_TEMPLATES`: por plantilla, `schema` (Zod) + `render(data) → { subject, html, text }`. Implementa las cinco `aviso_*` (asignada, briefing completado, informe aprobado, auditoría cerrada, feedback cliente); declara las reservadas `password_reset`/`envio_informe_cliente`/`envio_briefing_cliente` con su schema (R5) |
| `src/lib/server/email/layout.ts` (nuevo) | Layout HTML branded SyS (header con marca, colores inline `--sys-*` traducidos a hex, footer) + versión texto plano. Email-safe (estilos inline, tablas) |
| `src/lib/server/email/notify.ts` (nuevo) | `resolveInternalRecipientUserIds(auditId, evento)` (R11, R12 — devuelve userIds para reuso de #53) + resolución de emails desde userIds; `onAuditoriaAsignada`, `onBriefingCompletado`, `onInformeAprobado`, `onAuditoriaCerrada`, `onFeedbackCliente` (R8–R10, R16, R17); cada uno envuelto en try/catch que loguea y no propaga (R13) |

### Puntos de enganche (existentes, extender)

| Archivo | Cambio |
|---|---|
| `src/lib/server/backoffice/audits.ts` | Tras `insertAuditAssignments` en `createAudit`/`updateAudit`, calcular técnicos **recién** asignados y llamar `onAuditoriaAsignada(auditId, nuevos)` fuera de la transacción (R8) |
| `src/lib/server/briefing/submit.ts` | Tras `updateAuditStatus(id, 'briefing_completo')`, llamar `onBriefingCompletado(id)` (R9). El early-return existente evita reenvío |
| form action / servicio que aprueba informe (consumidor de `approveReport`) | Tras aprobar, llamar `onInformeAprobado(auditId, reportId, version)` (R10) |

### Tests

| Archivo | Cubre |
|---|---|
| `tests/email-config.test.ts` | R1 (env opcional, parsea con/sin SMTP) |
| `tests/email-client.test.ts` | R2 (dry-run no toca transport), R3 (envío con transport mock), R4 (reintento), R14 (logs sin `pass`) |
| `tests/email-templates.test.ts` | R5 (render HTML+texto de las 5 `aviso_*`; datos inválidos → `fallido`) |
| `tests/email-schema.test.ts` | R6 (migración 2x idempotente; columnas/CHECK; `notify_internal_email`) |
| `tests/email-log.test.ts` | R7 (filas `dry_run`/`fallido`/`enviado`; N destinatarios → N filas) |
| `tests/email-eventos.test.ts` | R8–R13 (eventos disparan envíos correctos; destinatarios por asignación; opt-out; no rompe la operación) |

## Firmas principales

```typescript
// src/lib/server/email/index.ts
import { z } from 'zod';

export type EmailTemplateName =
  | 'aviso_auditoria_asignada' | 'aviso_briefing_completado' | 'aviso_informe_aprobado'
  | 'password_reset' | 'envio_informe_cliente' | 'envio_briefing_cliente';

export type EmailSendResult = {
  status: 'enviado' | 'fallido' | 'dry_run';
  logIds: string[];
  error?: string;
};

// Mapa tipo-plantilla → tipo de datos, derivado de EMAIL_TEMPLATES[name].schema (z.infer).
export type EmailTemplateData = {
  aviso_auditoria_asignada: { tecnicoNombre: string; auditRef: string; clienteNombre: string; auditUrl: string };
  aviso_briefing_completado: { auditRef: string; clienteNombre: string; auditUrl: string };
  aviso_informe_aprobado: { auditRef: string; clienteNombre: string; version: number; auditUrl: string };
  password_reset: { nombre: string; resetUrl: string; expiraEnMin: number };          // #50
  envio_informe_cliente: { contactoNombre: string; informeUrl: string; pdfUrl?: string }; // #51
  envio_briefing_cliente: { contactoNombre: string; briefingUrl: string };            // #52
};

export async function sendEmail<T extends EmailTemplateName>(
  template: T, to: string | string[], data: EmailTemplateData[T]
): Promise<EmailSendResult>;

// src/lib/server/email/templates.ts
export type RenderedEmail = { subject: string; html: string; text: string };
export type EmailTemplate<T> = { schema: z.ZodType<T>; render: (data: T) => RenderedEmail };
export const EMAIL_TEMPLATES: { [K in EmailTemplateName]: EmailTemplate<EmailTemplateData[K]> };

// src/lib/server/email/transport.ts
export const EMAIL_MAX_ATTEMPTS = 3;
export function isDryRun(): boolean;
export async function sendWithRetry(msg: { from: string; to: string; subject: string; html: string; text: string }): Promise<void>;

// src/lib/server/email/notify.ts
export type EventoInterno =
  | 'auditoria_asignada' | 'briefing_completado' | 'informe_aprobado'
  | 'auditoria_cerrada' | 'feedback_cliente';
// R11, R12 — userIds únicos (admin involucrado = created_by si admin, si no todos los admins
// activos; + técnicos asignados según evento), sin inactivos ni opt-out. Reusado por #53 (push).
export async function resolveInternalRecipientUserIds(auditId: string, evento: EventoInterno): Promise<string[]>;
export async function onAuditoriaAsignada(auditId: string, techIds: string[]): Promise<void>;
export async function onBriefingCompletado(auditId: string): Promise<void>;
export async function onInformeAprobado(auditId: string, reportId: string, version: number): Promise<void>;
export async function onAuditoriaCerrada(auditId: string): Promise<void>;                  // R16
export async function onFeedbackCliente(auditId: string, valoracionGlobal: number): Promise<void>; // R17

// src/lib/server/db/email-log.ts
export type EmailLogStatus = 'enviado' | 'fallido' | 'dry_run';
export async function insertEmailLog(input: {
  toEmail: string; template: EmailTemplateName; status: EmailLogStatus; error: string | null; sentAt: Date | null;
}): Promise<{ id: string }>;
```

## Errores reutilizados / nuevos

- **Reusados:** `logger` (redacción de `pass`/`secret`/`token`, R14); patrón `optionalString` de
  `env.ts`; runner `runMigrations` (idempotencia por `schema_migration`).
- **Nuevos:** ninguna clase de error de dominio. `sendEmail` **no lanza**: traduce fallos de
  validación o SMTP a `status: 'fallido'` + `error` y a una fila `email_log`. Esto habilita R13
  (los avisos internos nunca tumban la operación de negocio). El llamador que necesite saber el
  resultado lo lee del `EmailSendResult`.

## Alternativas descartadas

| Alternativa | Motivo descarte |
|---|---|
| Proveedor SaaS (SendGrid/SES/Resend) | Decisión de puerta: self-hosted con correo corporativo SyS sobre SMTP genérico. No reabrir |
| Disparar avisos dentro de las funciones `db/*` puras (p.ej. `approveReport`) | Acopla la capa de datos a email/render y rompe las capas de `architecture.md`. Se enganchan en dominio/backoffice, tras la transacción |
| Cola persistente + worker de reintento | Sobredimensionado para el volumen actual (avisos internos de un equipo chico). Reintento in-proceso acotado (R4) alcanza; `email_log` deja la traza para reprocesar manualmente si hace falta |
| Plantillas como filas en DB | El proyecto evita "plantillas como código editable" para auditorías, pero los emails transaccionales son pocos y branded; tenerlas en TS tipado con Zod es más simple y testeable. Reevaluar si crecen |
| Render con motor de templating (handlebars/mjml) | Dependencia extra para 3 emails. Funciones `render(data)` en TS + layout inline email-safe bastan; sin libs de plantillas |
| Lanzar excepción ante fallo SMTP | Rompería la operación que dispara el aviso (asignar/aprobar/briefing). Se prefiere degradar y registrar (R13) |
| `to` siempre un solo destinatario | Los avisos internos van a varios (técnicos + admin); `string \| string[]` con una fila `email_log` por destinatario evita BCC y da traza por persona |
| Reusar `crm-leads` email u otra tabla existente | Distinta semántica; `email_log` es traza transaccional propia, acotada y append-only |

## Open questions (puerta humana) — RESUELTAS 2026-06-25 (Martín)

1. **Proveedor — DECIDIDO:** SMTP genérico (nodemailer), self-hosted, correo corporativo SyS. NO SaaS.
2. **Eventos automáticos — DECIDIDO:** avisos **internos** (técnicos/admin) en asignación, briefing
   completado e informe aprobado. Sin envíos al cliente en #49.
3. **Dry-run — DECIDIDO:** activo cuando falta `SMTP_HOST` o `NODE_ENV!=='production'`; no envía real,
   registra `dry_run`.
4. **Opt-out — DECIDIDO:** booleano mínimo `app_user.notify_internal_email` (default `true`). Sin
   centro de preferencias en esta iteración.
