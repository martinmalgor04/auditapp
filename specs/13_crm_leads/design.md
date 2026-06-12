# Design — #13 13_crm_leads

## Visión

Mini-CRM dentro de auditapp, mismo stack y capas que el resto: SQL puro en
`src/lib/server/db/`, dominio en `src/lib/server/crm/`, UI en `src/routes/(app)/crm/`,
API en `src/routes/api/crm/`. La vista es **lista agrupable por estado con contadores**,
no kanban drag&drop (descartado: ver alternativas).

## Schema (migración `migrations/006_crm_leads.sql`)

```sql
CREATE TABLE crm_lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  empresa text NOT NULL,
  contacto text,
  telefono text,
  source text NOT NULL CHECK (source IN ('firecrawl', 'referido', 'manual', 'otro')),
  status text NOT NULL DEFAULT 'lead' CHECK (status IN (
    'lead', 'contactado', 'agendo', 'auditado', 'presupuestado', 'cliente', 'descartado'
  )),
  notas text,
  proxima_accion text,
  proxima_accion_fecha date,
  client_id uuid REFERENCES client(id),
  audit_id uuid REFERENCES audit(id),
  presupuesto_ref text,
  descartado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX crm_lead_email_key ON crm_lead (lower(email));
CREATE INDEX crm_lead_status_idx ON crm_lead (status);

CREATE TABLE crm_lead_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES crm_lead(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status text NOT NULL,
  changed_by uuid REFERENCES app_user(id),  -- NULL = endpoint batch / sistema
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Notas:
- `presupuesto_ref` es **text libre** (nro/URL de presupuestos.serviciosysistemas.com.ar).
  No hay tabla `presupuesto` en el schema actual; cuando exista, una migración futura
  lo convierte en FK. Ver open question OQ1.
- Borrado lógico = `status = 'descartado'` + `descartado_at` (R9). No se agrega
  `archived_at`: un solo mecanismo.

## Dominio — `src/lib/server/crm/`

```
src/lib/server/crm/
├── state-machine.ts   # transiciones puras
├── schemas.ts         # Zod
└── errors.ts
```

```typescript
// state-machine.ts
export const CRM_FUNNEL = ['lead','contactado','agendo','auditado','presupuestado','cliente'] as const;
export type CrmStatus = (typeof CRM_FUNNEL)[number] | 'descartado';
export function canTransition(from: CrmStatus, to: CrmStatus): boolean;
export function assertTransition(from: CrmStatus, to: CrmStatus): void; // lanza CrmInvalidTransitionError
export function pathTo(from: CrmStatus, to: CrmStatus): CrmStatus[];    // pasos intermedios para R3

// errors.ts
export class CrmInvalidTransitionError extends Error { readonly code = 'CRM_INVALID_TRANSITION'; }
export class CrmLeadNotFoundError extends Error { readonly code = 'CRM_LEAD_NOT_FOUND'; }

// schemas.ts
export const crmLeadBatchSchema;   // z.array(item).min(1).max(200); email lowercased via transform
export const crmLeadCreateSchema;  // alta manual admin
export const crmLeadUpdateSchema;  // notas, proxima_accion(+fecha), contacto, telefono,
                                   // presupuesto_ref, client_id, audit_id — email/source excluidos
export const crmStatusChangeSchema; // { to: CrmStatus }
```

## DB — `src/lib/server/db/crm-leads.ts`

```typescript
export async function listLeads(filters: { status?, source?, q?, includeDescartados? }): Promise<CrmLeadRow[]>;
export async function funnelCounts(): Promise<Record<CrmStatus, number>>; // una query GROUP BY
export async function getLeadById(id: string): Promise<CrmLeadRow | null>;
export async function createLead(input, createdBy): Promise<CrmLeadRow>;
export async function upsertLeadsBatch(items): Promise<{ inserted: number; updated: number }>;
  // INSERT ... ON CONFLICT (lower(email)) DO UPDATE
  //   SET contacto = COALESCE(crm_lead.contacto, EXCLUDED.contacto),
  //       telefono = COALESCE(crm_lead.telefono, EXCLUDED.telefono),
  //       notas = concat anexando, updated_at = now()
  //   — nunca pisa status ni source. Todo el lote en una transacción.
export async function changeStatus(id, to, changedBy): Promise<CrmLeadRow>;
  // transacción: assertTransition + UPDATE + INSERT crm_lead_event(s)
  // to = 'descartado' ⇒ descartado_at = now(); reactivación ⇒ descartado_at = NULL
export async function updateLead(id, patch): Promise<CrmLeadRow>;
export async function linkAudit(id, auditId, changedBy): Promise<CrmLeadRow>;
  // usa pathTo(status, 'auditado') y registra cada paso como evento (R3)
export async function listLeadEvents(leadId): Promise<CrmLeadEventRow[]>;
```

## API — `src/routes/api/crm/`

| Ruta | Método | Guard | Función |
|---|---|---|---|
| `leads/batch/+server.ts` | POST | token `CRM_API_TOKEN` (Bearer, `timingSafeEqual`) | upsert lote n8n/Firecrawl (R4–R6) |
| `leads/+server.ts` | GET | `requireStaffApi` | lista con filtros + búsqueda (R10) |
| `leads/+server.ts` | POST | `requireAdminApi` | alta manual (R7) |
| `leads/[id]/+server.ts` | PATCH | `requireAdminApi` | edición / vínculo client / vínculo audit (R13, R14, R3) |
| `leads/[id]/status/+server.ts` | POST | `requireStaffApi` | cambio de estado (R12) |

Todas responden con `apiSuccess` / `apiError` (envelope existente). Sin handler DELETE.
El guard del token vive en `src/lib/server/api/require-crm-token.ts`, espejo de
`require-staff.ts`. `CRM_API_TOKEN` se suma a la validación de env al arranque.

## UI — `src/routes/(app)/crm/`

```
+page.server.ts   # load: listLeads(filters de URL) + funnelCounts; actions o fetch a la API
+page.svelte      # barra de contadores del funnel (6 chips) + filtros status/source +
                  # búsqueda + tabla; fila expandible con notas, próxima acción, historial
lead-row.svelte   # componente de fila (<200 líneas)
```

Acciones desde la fila: avanzar estado (select con solo transiciones válidas), descartar,
editar (solo admin, modal simple). Tokens de marca SyS ya existentes en el backoffice (#11).
Entrada de navegación "CRM" en el layout `(app)` visible para staff.

## Errores

Reutiliza: `apiError`, guards existentes (`requireStaffApi`, `requireAdminApi`).
Nuevos: `CrmInvalidTransitionError` (→ 409), `CrmLeadNotFoundError` (→ 404).

## Alternativas descartadas

1. **Kanban drag&drop.** Una lib de DnD + estado optimista para 6 columnas no se justifica
   en un mini-CRM operado por 1–2 admins; la lista con select de transición cubre el mismo
   flujo con una fracción del código y es testeable por API. El acceptance admite
   "kanban o lista": se elige lista.
2. **Reusar tabla `client` (origen='prospecto') como CRM.** Mezclaría el ciclo comercial con
   la entidad operativa de auditorías, obligaría a aflojar NOT NULLs y contaminaría seeds
   Tango. Se separa `crm_lead` con `client_id` opcional como puente.
3. **Trigger SQL para validar transiciones.** La máquina de estados en TS es testeable en
   unit tests, reutilizable por `linkAudit` (path intermedio) y consistente con
   `08_cierre_scoring` y `14_informe_ia`, que también validan estados en dominio.
4. **Webhook firmado (HMAC) para n8n.** Token Bearer estático es suficiente para un
   endpoint interno detrás de TLS llamado solo por n8n self-hosted; HMAC agrega gestión
   de firmas sin amenaza real nueva. Comparación constant-time igualmente obligatoria.
