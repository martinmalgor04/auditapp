# Design — #52 52_envio_briefing_email

## Alcance

Acción manual en el detalle de la auditoría para enviar el link de briefing externo
(`/briefing/[token]`) al contacto del cliente por email, vía el servicio #49. Completa
el cuerpo de la plantilla reservada `envio_briefing_cliente`, agrega una form action
guardada (admin/técnico asignado), registra cada envío en `email_log` y muestra una
marca de "briefing enviado" en el detalle. No automático. No altera el estado de la
auditoría.

| Incluido | Excluido |
|---|---|
| Cuerpo de plantilla `envio_briefing_cliente` (HTML+texto, R3) | El contrato `sendEmail`/`email_log` (ya en #49) |
| Form action `enviarBriefingEmail` con guard y validación Zod (R4, R5, R8, R9) | Envío automático / recordatorios (n8n) |
| UI: botón + modal de confirmación + toast (R1, R2, R10) | Adjuntos, tracking apertura/clic |
| Marca "briefing enviado" derivada de `email_log` (R6, R7, R11) | Envío de informe (#51), reset (#50) |
| Tests unit/integración/e2e (R12) | Cambios a estados de briefing (#4/#5) |

## Dependencias (contratos usados)

| Feature | Contrato |
|---|---|
| `49_servicio_email` | `sendEmail(template, to, data)` y `EmailSendResult` (`src/lib/server/email/index.ts`); `EMAIL_TEMPLATES['envio_briefing_cliente']` con su `schema` Zod (cuerpo a completar aquí); `email_log` + `insertEmailLog` / `listEmailLogByTemplate` (`src/lib/server/db/email-log.ts`); `layout.ts` branded SyS |
| `04_backoffice` | `getBriefingUrl(publicToken)`, `canShowBriefingLink(status, publicToken)` (`src/lib/server/backoffice/briefing-link.ts`); detalle `src/routes/(app)/auditorias/[id]/+page.server.ts` |
| `05_briefing_externo` | URL pública `/briefing/[token]` y su vigencia (token + estado) |
| `22`/`23` | `empresa.email`, `empresa.referente_nombre` (contacto); consulta de empresa por `audit.empresa_id` ya presente en `audits.ts` |
| `33_acceso_por_asignacion_unificado` | `techIsAssigned(auditId, userId)` (`src/lib/server/db/audit-assignment.ts`) |
| auth (#3) | `requireStaff(locals)` (`src/lib/server/auth/guards.ts`) |
| `38_toast_error_guardado` | Patrón de toast de resultado en la UI del detalle |

## Arquitectura

```
Detalle auditoría  src/routes/(app)/auditorias/[id]/
  load → expone: briefingUrl, contactEmail (empresa.email), contactName,
                 canSendBriefingEmail (R2), briefingEmail {sentTo, sentAt} (R6)
  +page.svelte → botón "Enviar briefing por mail" + modal confirmación + toast (R1,R2,R10)

POST action ?/enviarBriefingEmail   (R4,R5,R8,R9)
  requireStaff(locals)
  cargar audit (getAuditById) + empresa.email
  guard: isAdmin || techIsAssigned(auditId, user.id)            → si no, fail(403)  (R8)
  guard estado: canShowBriefingLink(status, publicToken)        → si no, fail(409)  (R2)
  parse + validar destinatario con Zod (email)                  → si no, fail(400)  (R4)
  briefingUrl = getBriefingUrl(publicToken)
  contactoNombre = empresa.referente_nombre ?? razon_social
  res = sendEmail('envio_briefing_cliente', to, { contactoNombre, briefingUrl })  (R5)
       └─ #49 registra fila en email_log (dry_run | enviado | fallido)
  NO toca audit.status ni public_token                                            (R9)
  return { success: res.status !== 'fallido', status: res.status, sentTo: to }   (R10)
```

**Capas (`docs/architecture.md`):** la orquestación (guard + validación + llamada a
`sendEmail`) vive en una función de dominio `src/lib/server/backoffice/briefing-email.ts`;
la form action en `+page.server.ts` solo parsea, llama al dominio y mapea errores a
`fail`. No se mete lógica de DB ni de email en `.svelte`.

## Decisión de marca "briefing enviado" (R6, R7, R11)

**Decidido: derivar de `email_log`, SIN migración.** La marca se computa consultando la
última fila de `email_log` con `template = 'envio_briefing_cliente'` para esa auditoría.
Como `email_log` (#49) no tiene `audit_id`, se filtra por `to_email IN (emails de la
empresa)` **o** —preferido— se extiende el insert para incluir el destinatario y se
matchea por `to_email`; el `created_at`/`sent_at` da la fecha y `to_email` el destinatario.

> Nota de implementación: `email_log` de #49 tiene columnas `to_email`, `template`,
> `status`, `created_at`, `sent_at`. Eso basta para "último envío de
> `envio_briefing_cliente` a un email del cliente". Por lo tanto **R11 NO añade
> migración**. Si durante la implementación se decide indexar por auditoría, se añadiría
> una columna idempotente `audit_id uuid` a `email_log` en una migración posterior a las
> de #49/#50/#51 — pero el diseño base no la necesita.

`getBriefingEmailMark(auditId)` consulta `listEmailLogByTemplate('envio_briefing_cliente')`
acotado a los emails del cliente de esa auditoría y devuelve `{ sentTo, sentAt } | null`.

## Archivos a crear / modificar

### Dominio server

| Archivo | Cambio |
|---|---|
| `src/lib/server/backoffice/briefing-email.ts` (nuevo) | `sendBriefingEmail(auditId, user, toOverride?)` (guard asignación + estado + validación Zod + `sendEmail`, R4/R5/R8/R9); `getBriefingEmailMark(auditId)` (R6/R7) |
| `src/lib/server/email/templates.ts` (#49, extender) | Completar `render` de `envio_briefing_cliente` (HTML branded + texto, R3) — el schema ya existe en #49 |

### Rutas / UI

| Archivo | Cambio |
|---|---|
| `src/routes/(app)/auditorias/[id]/+page.server.ts` (extender) | `load`: exponer `contactEmail`, `contactName`, `canSendBriefingEmail` (R2), `briefingEmail` (R6). `actions.enviarBriefingEmail` (R4/R5/R8/R9/R10) |
| `src/routes/(app)/auditorias/[id]/+page.svelte` (extender) | Botón "Enviar briefing por mail" junto al bloque de link de briefing; modal de confirmación con destinatario editable; toast de resultado (R1/R2/R10) |

### Tests

| Archivo | Cubre |
|---|---|
| `tests/envio-briefing-email-enable.test.ts` | R2 (matriz token/estado/email → habilitado/deshabilitado) |
| `tests/envio-briefing-email-template.test.ts` | R3 (render HTML+texto; datos inválidos → `fallido`) |
| `tests/api/envio-briefing-email-send.test.ts` | R4, R5, R6, R7, R8, R9 (validación, log, marca, reenvío, guard, no-cambio de estado) |
| `tests/envio-briefing-email-schema.test.ts` | R11 (marca derivada de `email_log`; o migración idempotente si se añadió) |
| `e2e/envio-briefing-email.spec.ts` | R1, R10 (botón visible, confirmación, toast) |

## Firmas

```typescript
// src/lib/server/backoffice/briefing-email.ts
import { z } from 'zod';

export const briefingEmailRecipientSchema = z.string().trim().email();

export type BriefingEmailResult = {
  status: 'enviado' | 'fallido' | 'dry_run';
  sentTo: string;
};

// Guard (admin || técnico asignado) + estado (canShowBriefingLink) + validación email.
// NO lanza por SMTP (delega en sendEmail de #49). Lanza errores de dominio para guard/estado/Zod.
export async function sendBriefingEmail(
  auditId: string,
  user: AppUser,
  toOverride?: string
): Promise<BriefingEmailResult>;

// Marca derivada de email_log (último envío de la plantilla a un email del cliente).
export async function getBriefingEmailMark(
  auditId: string
): Promise<{ sentTo: string; sentAt: string } | null>;
```

```typescript
// Plantilla a completar en src/lib/server/email/templates.ts (schema ya en #49)
// data: { contactoNombre: string; briefingUrl: string }
// subject: "Servicios y Sistemas — completá el briefing previo a tu auditoría"
// html/text: saludo a contactoNombre + explicación breve (qué datos pedimos y por qué) + CTA a briefingUrl
```

## Errores reutilizados / nuevos

- **Reusados:** `AuditNotFoundError`, `InvalidStateTransitionError`
  (`src/lib/server/backoffice/errors.ts`); `ValidationError` para el destinatario Zod;
  `requireStaff` + chequeo `techIsAssigned` (#33); envelope `fail`/`apiError` (convenciones).
- **Nuevos:** ninguna clase nueva imprescindible. `sendBriefingEmail` mapea: guard →
  403, estado no apto → 409, email inválido → 400; el resultado SMTP se propaga como
  `status` (nunca lanza, igual que #49). Opcionalmente `BriefingEmailNotAllowedError`
  para unificar guard/estado, pero se puede reusar los existentes.

## Seguridad

- Guard server-side en la action (R8): `requireStaff` + `admin || techIsAssigned`.
  Nunca confiar en `disabled` del cliente.
- No exponer otros datos de la auditoría en el email: solo `contactoNombre` y la URL
  pública de briefing (que ya es no-enumerable, #4).
- SQL parametrizado en `getBriefingEmailMark`.
- El email del destinatario editable se valida Zod en server antes de enviar.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Columna `briefing_email_sent_at`/`_to` en `audit` vía migración | Innecesario: `email_log` (#49) ya guarda destinatario + timestamp + plantilla; derivar la marca evita schema redundante y mantiene una sola fuente de verdad del envío. Se reevalúa solo si se necesita indexar por auditoría |
| Enviar dentro de `generateBriefingLink` (acoplar al alta de token) | El alcance pide disparo **manual** e independiente; reenvío sin regenerar token. Mantener acciones separadas |
| Cambiar `audit.status` al enviar (p. ej. marcar "enviado") | El alcance prohíbe alterar el estado salvo la marca; la máquina de estados de #4/#5 no debe tocarse (R9) |
| Reusar la plantilla de avisos internos `aviso_*` | Distinto destinatario (cliente, no staff) y copy; la plantilla reservada `envio_briefing_cliente` existe justo para esto (#49) |
| Adjuntar PDF o material | El briefing es un formulario online; solo va el link. Adjuntos quedan fuera de alcance |
| Guard solo por `assignedTechId` (campo único) | #32/#33 admiten varios técnicos; usar `techIsAssigned` (asignación efectiva) evita falsos 403 |

## Decisiones de puerta (Martín, 2026-06-25 — RESUELTAS)

1. **Marca "enviado":** **derivada de `email_log`** (sin migración, sin columnas nuevas en `audit`).
2. **Quién puede enviar:** **admin o técnico asignado** (`techIsAssigned`).
