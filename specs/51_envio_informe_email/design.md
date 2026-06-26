# Design — #51 51_envio_informe_email

## Alcance

Acción manual de backoffice para enviar el informe **aprobado** al contacto del cliente por email,
componiendo tres piezas existentes: el servicio de email #49 (`sendEmail`, plantilla reservada
`envio_informe_cliente`, `email_log`), la entrega pública #15 (share con token, `buildShareUrl`,
`/informe/[token]`, `/informe/[token]/imprimir` #30) y el contacto del cliente #22/#23
(`empresa.email`). Esta feature **define el cuerpo** de la plantilla `envio_informe_cliente`, agrega
un endpoint de envío con guards y validación, una UI (botón + confirmación + toast) y una marca
"informe enviado" derivada de `email_log`.

| Incluido (MVP) | Excluido |
|---|---|
| Cuerpo de la plantilla `envio_informe_cliente` (HTML branded + texto) | Adjuntar binario PDF / PDF server-side |
| Endpoint POST envío (guard admin/asignado, Zod destinatario) | Cambiar contrato `sendEmail`/`EmailTemplateName` |
| Asegurar share activo (reuso #15) y armar links | Envío automático / programado |
| Registro vía `email_log` (#49) + marca "enviado" derivada | Tabla/columna nueva de "enviado" |
| UI: botón, confirmación, toast (#38), reenvío | Tracking apertura/clic, bounces |

## Dependencias

| Feature | Contrato usado |
|---|---|
| `49_servicio_email` (spec_ready) | `sendEmail(template, to, data)` (`src/lib/server/email/index.ts`); registro de plantilla `EMAIL_TEMPLATES.envio_informe_cliente` con su `schema` ya declarado (`src/lib/server/email/templates.ts`); layout branded (`src/lib/server/email/layout.ts`); `email_log` + `insertEmailLog`/`listEmailLogByTemplate` (`src/lib/server/db/email-log.ts`) |
| `15_entrega_informe` (#15, done) | `createReportShare`, `buildShareUrl`, `INFORME_SHARE_UNAVAILABLE_MESSAGE` (`src/lib/server/informe/share.ts`); `getActiveShareByReport`/`listSharesByReport` (`src/lib/server/db/informe-shares.ts`); rutas públicas `/informe/[token]` y `/informe/[token]/imprimir` (#30) |
| `14_informe_ia` (#14, done) | `getReportByAuditVersion`, `AuditReportRow` (`status`, `clientDraft`) (`src/lib/server/db/informe-reports.ts`) |
| `23_crm_empresa_unificada` (#23, done) | `getEmpresaById` → `empresa.email`, `empresa.razonSocial`/referente (`src/lib/server/db/empresa.ts`); `audit.empresa_id` |
| guards (#32/#33) | `requireReportReadAccess(locals, audit, report)` (`src/lib/server/api/guards.ts`) — admin o técnico asignado, ya exige `status === 'aprobado'` para técnico |
| `informe/access.ts` | `getAuditForReport(auditId)` (incluye `assignedTechId`, `refCode`); `listAuditAssignments` |
| `11_ui_branding_sys` / `38_toast` | tokens `--sys-*`; componente toast (`src/lib/components/...`, patrón #38) |

## Arquitectura

```
detalle informe (admin o técnico asignado, status = aprobado, empresa.email válido)   (R1)
    │  click "Enviar por mail" → modal confirmación (destinatario prefilleado, editable)  (R3, R6)
    │  POST /api/audits/[id]/report/[version]/enviar   { to }
    ▼
+page/endpoint server:
   requireReportReadAccess(locals, audit, report)            (R5) → 401/403
   report.status === 'aprobado'?                             (R2) → 409 si no
   enviarInformeSchema.parse({ to })  (z.email)              (R3) → 400 si no
   share = getActiveShareByReport(report.id)
           ?? createReportShare({ reportId, createdBy:user.id, expiresInDays:default })  (R4, reuso #15)
   data = { contactoNombre, informeUrl: buildShareUrl(share.token),
            pdfUrl: `${informeUrl}/imprimir` }               (R4) — sin material interno
   result = sendEmail('envio_informe_cliente', to, data)     (#49: render + email_log + dry-run/retry)
   result.status === 'fallido' → apiError(genérico, 502)     (R8)
   éxito/dry_run → json envelope ok                          (R7)
    ▼
UI: toast éxito/error (#38)                                  (R6, R8)
    │  marca "informe enviado": listInformeEnvios(report.id) sobre email_log
detalle informe (load) muestra envíos: to_email + created_at, reenvío permitido   (R7)
```

**Decisión de capa:** el envío vive en la **capa de dominio/endpoint del segmento informe**, NO en
`db/*` puro (mismo criterio que #49/#15 — `db/` no conoce email). El share se asegura reusando #15;
no se duplica lógica de token. La marca "enviado" se **lee** de `email_log` (append-only de #49),
sin estado nuevo.

## Plantilla `envio_informe_cliente` — cuerpo (definido aquí)

`data` (schema ya declarado en #49): `{ contactoNombre: string; informeUrl: string; pdfUrl?: string }`.
El `render(data)` (en `src/lib/server/email/templates.ts`, completando la entrada reservada) produce
`{ subject, html, text }`:

- **subject:** `Tu informe de auditoría — Servicios y Sistemas`
- **html:** layout branded SyS (`layout.ts` de #49, header con logo, tokens `--sys-*` inline
  email-safe): saludo a `contactoNombre`, párrafo breve de contexto, **botón/CTA "Ver el informe"
  → `informeUrl`**, link secundario "Versión para imprimir / PDF" → `pdfUrl` (cuando presente),
  firma SyS y footer de confidencialidad. **Sin** datos del draft interno.
- **text:** versión texto plano equivalente con ambos links.

**Invariante (R4):** el `data` que recibe la plantilla solo contiene `contactoNombre`, `informeUrl`,
`pdfUrl`. El endpoint nunca le pasa `clientDraft`, `upsell_findings` ni `internal_draft`; el material
real del informe vive detrás del link público #15 (que ya aplica `stripInternalFindings`).

## Archivos a crear/modificar

### Email (#49, extender)

| Archivo | Cambio |
|---|---|
| `src/lib/server/email/templates.ts` (extender) | Completar el `render` de la entrada **reservada** `envio_informe_cliente` (hoy declarada solo con schema en #49). El `schema` Zod no cambia |

### Dominio / endpoint (segmento informe)

| Archivo | Propósito |
|---|---|
| `src/lib/server/informe/enviar.ts` (nuevo) | `enviarInformeSchema = z.object({ to: z.string().email() }).strict()` (R3); `enviarInforme({ auditId, report, empresa, to, userId })` → asegura share (reuso #15), arma `data`, llama `sendEmail`, traduce resultado (R2/R4/R7/R8); `listInformeEnvios(reportId)` → consulta `email_log` filtrando `template='envio_informe_cliente'` por los shares/informe, devuelve `{ toEmail, sentAt|createdAt, status }[]` (R7) |
| `src/lib/server/db/email-log.ts` (#49, extender si hace falta) | Helper `listEmailLogByTemplate(template, since?)` ya previsto en #49; #51 lo usa para la marca de enviado. Si #49 no lo expone con filtro suficiente, agregar `listInformeEnvioLogs(toEmails)` mínimo (solo lectura) |

> **Marca "enviado" sin schema nuevo:** `email_log` (#49) registra `to_email`, `template`, `status`,
> `created_at`, `sent_at`. La marca se deriva filtrando `template='envio_informe_cliente'`. **No se
> requiere migración** (decisión de puerta 2). *Limitación conocida:* `email_log` no guarda
> `report_id`; la asociación informe↔envío se hace por el `to_email` del envío + acotando por la
> empresa de la auditoría (suficiente para "a quién y cuándo" del acceptance). Si en review se
> considera frágil, alternativa propuesta abajo (columna opcional `email_log.context`).

### API route

| Ruta | Método | Propósito | Códigos |
|---|---|---|---|
| `/api/audits/[id]/report/[version]/enviar` | POST | Enviar el informe al contacto (R2–R5, R7, R8) | 200 · 400 (Zod) · 401 · 403 · 409 (no aprobado) · 502 (sendEmail fallido) |

Hermana de las rutas de share de #15 bajo `/api/audits/[id]/report/[version]/`. Carga `audit`
(`getAuditForReport`), `report` (`getReportByAuditVersion`), `empresa` (`getEmpresaById`);
`requireReportReadAccess` para el guard; errores vía `apiError`.

### UI backoffice

| Archivo | Cambio |
|---|---|
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.server.ts` (extender) | En `load`, cuando `status==='aprobado'`: cargar `empresa.email` (prefill) y `listInformeEnvios(report.id)` (marca "enviado") |
| `src/routes/(app)/auditorias/[id]/informe/[version]/+page.svelte` (extender) | Botón "Enviar por mail" (habilitado solo aprobado + email válido, R1), modal de confirmación con destinatario editable (R3/R6), llamada al endpoint, toast (#38), lista "informe enviado" (R7) |
| `src/lib/components/informe/enviar-informe-dialog.svelte` (nuevo) | Modal: input destinatario (prefill `empresa.email`), validación cliente, confirmar/cancelar; emite el POST y propaga el resultado al toast |

### Tests

| Archivo | Cubre |
|---|---|
| `tests/informe-enviar.test.ts` | R3 (schema Zod acepta/rechaza), armado de `data` sin campos internos (R4), `listInformeEnvios` (R7) |
| `tests/email-templates.test.ts` (extender) | R4 (render `envio_informe_cliente`: HTML+texto branded con `informeUrl`/`pdfUrl`; fixture con `upsell_findings`/`internal_draft` → ninguno de sus textos aparece — test explícito) |
| `tests/informe-enviado.test.ts` | R7 (marca derivada de `email_log`: destinatario + fecha; reenvío → fila extra) |
| `tests/api/informe-enviar.test.ts` | R2 (409 no aprobado), R3 (400 Zod), R5 (401/403/200), R7 (fila `email_log` por envío), R8 (502 genérico ante `sendEmail` fallido, mock) |
| `e2e/envio-informe-email.spec.ts` | R1, R3, R6, R7 (botón → confirmación prefilleada → toast éxito → marca "enviado"); dry-run de #49 (sin SMTP real) |

Fixtures: reusar golden de #14 (`INFORME_FAKE=1`) para llegar a `aprobado`; transporte de email en
dry-run/mock (#49) para no enviar real.

## Firmas principales

```typescript
// src/lib/server/informe/enviar.ts
import { z } from 'zod';

export const enviarInformeSchema = z.object({ to: z.string().email() }).strict();

export type EnviarInformeResult =
  | { ok: true; status: 'enviado' | 'dry_run'; to: string }
  | { ok: false; status: 'fallido'; error: string };   // error genérico, sin SMTP_*

export async function enviarInforme(input: {
  auditId: string;
  report: AuditReportRow;        // status === 'aprobado' garantizado por el caller (R2)
  empresaNombre: string;
  to: string;                    // ya validado por enviarInformeSchema (R3)
  userId: string;                // createdBy del share si hay que crearlo
}): Promise<EnviarInformeResult>;

export type InformeEnvio = { toEmail: string; status: string; at: string };  // ISO
export async function listInformeEnvios(reportId: string, empresaEmail: string | null): Promise<InformeEnvio[]>;

// src/lib/server/email/templates.ts (completar entrada reservada de #49)
// EMAIL_TEMPLATES.envio_informe_cliente.render(data) → { subject, html, text }
```

## Errores reutilizados / nuevos

- **Reusados:** `apiError` (envelope, `src/lib/server/api/envelope.ts`); `requireReportReadAccess`
  (401/403); `InformeReportNotApprovedError` (409) de `informe/errors.ts` para el guard de estado;
  `sendEmail` **no lanza** (#49) → el endpoint mapea `status:'fallido'` a 502 con mensaje genérico
  (R8); `logger` con redacción (#49) para SMTP.
- **Nuevos:** ninguna clase de error de dominio nueva. El estado de envío se modela como
  `EnviarInformeResult`, no como excepción.

## Migración SQL

**Ninguna.** La marca "informe enviado" se deriva de `email_log` (#49); no se crea tabla ni columna
(decisión de puerta 2). Si en review se prefiere asociación robusta informe↔envío, la **alternativa
propuesta** (no incluida ahora) es agregar en la migración de #49 una columna opcional
`email_log.context jsonb NULL` (idempotente, `ADD COLUMN IF NOT EXISTS`) para guardar `{ reportId }`;
iría **después** de las migraciones de #49 y #50. Queda como open question.

## Alternativas descartadas

| Alternativa | Motivo descarte |
|---|---|
| Adjuntar el binario PDF al email | No hay PDF server-side (decisión #15/#30: print desde navegador). Adjuntar exigiría puppeteer (~300 MB) en la imagen Docker para volumen bajísimo. Se envía link imprimible (#30) |
| Tabla/columna nueva `informe_enviado` | `email_log` (#49) ya es la traza append-only de envíos; duplicar estado invita a divergencia. Marca derivada (decisión de puerta 2) |
| Crear un share nuevo en cada envío | Multiplicaría tokens activos y rompería el invariante "un share activo por informe" de #15. Se **reusa** el activo; solo se crea si no existe |
| Disparar el envío dentro de `db/*` o de `approveReport` | Acopla datos a email y haría el envío automático; el acceptance pide disparo **manual** desde UI |
| Pasar `clientDraft`/render del informe en el cuerpo del email | Expondría material y duplicaría el render; el informe vive detrás del link público #15 (ya sin material interno). El email solo lleva links |
| Nueva plantilla propia en vez de la reservada `envio_informe_cliente` | #49 ya reservó la plantilla y su schema para esta feature; crear otra rompería el registro central |
| Lanzar excepción ante fallo de SMTP | `sendEmail` no lanza (#49); se traduce a 502 + toast de error sin tumbar la pantalla (R8) |

## Decisiones de puerta (Martín, 2026-06-25 — RESUELTAS)

1. **Marca "enviado":** **derivada de `email_log`** por `template + to_email` acotado por la empresa
   de la auditoría. **Sin schema nuevo, sin migración.**
2. **Link vs PDF:** se envía **link** público + **link** imprimible (#30), **sin adjuntar binario**.
3. **Quién puede enviar:** **admin o técnico asignado** (reuso `requireReportReadAccess`).

## Open questions (puerta humana)

1. **Expiración del share creado al enviar:** si no hay share activo, se crea con el default de #15
   (`INFORME_SHARE_DEFAULT_DAYS = 90`). Se asume 90 días salvo objeción al implementar.
