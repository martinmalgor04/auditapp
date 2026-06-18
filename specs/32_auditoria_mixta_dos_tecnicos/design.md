# Design — 32_auditoria_mixta_dos_tecnicos

> Cómo se asigna **un técnico por área** (tabla `audit_assignment`), cómo el form
> técnico **filtra secciones por especialidad asignada**, y cómo se **bloquea el
> CAB** tras la confirmación del primer técnico. Reutiliza los guards de
> especialidad y el mapeo `audit_type → template → section` ya existentes. NO
> toca scoring ni render del informe. Decisiones de la puerta humana
> (2026-06-18) incorporadas; ver requirements.md.

## 1. Estado actual verificado

```
alta:  new/+page.svelte  → assignedTechId (1 select)
       new/+page.server.ts → createAudit(input)            (audits.ts)
         INSERT audit(... assigned_tech_id ...)             ← un solo tech
form:  form/+page.server.ts → loadAuditForm(id, user)       (load-form.ts)
         assertFormAccess: auditMatchesUserScope(types, user)  ← OVERLAP (laxo)
         listFormSections/Items: JOIN section ON template_id = ANY(template_ids)
                                                              ← TODAS las secciones
```

- **Mapeo `audit_type → template → section` (clave del filtrado).**
  `TYPE_TO_TEMPLATE_CODE` (audits.ts) es **1:1**: `it→'it'`,
  `erp-tango→'erp-tango'`, `erp-estandar→'erp-estandar'`.
  `resolveTemplateIdsForTypes(types)` resuelve los `template.id` activos por
  `code`. Una `section` pertenece a un `template_id`, y ese template corresponde
  a exactamente un `audit_type`. → **Para saber el área de una sección basta su
  `template_id`; para saber qué secciones ve un técnico, se mapea sus
  `audit_type` asignados a `template_id` y se filtran las secciones por ese
  conjunto.** El CAB se distingue por `section.code = 'CAB'`.
- **Guards de especialidad (`audit-access.ts`).** `userCanUseAuditTypes([tipo],
  user)` valida la asignación (R7). `auditMatchesUserScope` (overlap) hoy decide
  el acceso al form; se reemplaza por asignación efectiva (R14, R22).
- **Migraciones.** `migrate.ts` aplica `migrations/*.sql` no registrados y
  **registra la versión en `schema_migration` él mismo** → el `.sql` NO debe
  auto-insertar en `schema_migration`. Patrón idempotente: `DO $$ … END $$` con
  `IF NOT EXISTS` (ver `018_hora_inicio_fin.sql`).

## 2. Migración nueva — `migrations/020_audit_assignment.sql`

Idempotente (creación con `IF NOT EXISTS`, columnas con guarda `information_schema`,
backfill con `ON CONFLICT DO NOTHING`). NO auto-registra en `schema_migration`.

```sql
-- migrations/020_audit_assignment.sql
-- Feature #32: asignación de auditoría por área (un técnico por audit_type) +
-- estado de confirmación del CAB compartido. Idempotente.

-- (R1) Tabla de asignación por área.
CREATE TABLE IF NOT EXISTS audit_assignment (
  audit_id   uuid NOT NULL REFERENCES audit(id) ON DELETE CASCADE,
  audit_type text NOT NULL CHECK (audit_type IN ('it', 'erp-tango', 'erp-estandar')),
  tech_id    uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id, audit_type)          -- (R1) unicidad por (audit_id, audit_type)
);

CREATE INDEX IF NOT EXISTS audit_assignment_tech_id_idx ON audit_assignment (tech_id);

-- (R5) Estado explícito "CAB confirmado" en audit (idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit' AND column_name = 'cab_confirmed_by'
  ) THEN
    ALTER TABLE audit ADD COLUMN cab_confirmed_by uuid REFERENCES app_user(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit' AND column_name = 'cab_confirmed_at'
  ) THEN
    ALTER TABLE audit ADD COLUMN cab_confirmed_at timestamptz;
  END IF;
END $$;

-- (R2, R3, R26) Backfill desde assigned_tech_id: una fila por tipo del array.
INSERT INTO audit_assignment (audit_id, audit_type, tech_id)
SELECT a.id, t.audit_type, a.assigned_tech_id
FROM audit a
CROSS JOIN LATERAL unnest(a.types) AS t(audit_type)
WHERE a.assigned_tech_id IS NOT NULL
ON CONFLICT (audit_id, audit_type) DO NOTHING;
```

Notas:
- **`PRIMARY KEY (audit_id, audit_type)`** cubre la unicidad de R1 sin índice
  extra. `audit_type` se valida con CHECK (mismo dominio que `app_user.audit_types`).
- **`assigned_tech_id` se conserva** (R4): la migración no lo toca. Pasa a ser
  "técnico líder/responsable"; la asignación por área vive en `audit_assignment`.
- **Backfill (R2):** `unnest(a.types)` expande el array; cada tipo recibe el
  `assigned_tech_id`. Para auditorías preexistentes, ambos tipos del combo quedan
  asignados al mismo técnico (estado heredado fiel: antes había uno solo). El CAB
  queda **no confirmado** (`cab_confirmed_*` nulos) → editable por el primero que
  entre (R26).
- **Idempotencia (R3):** segunda corrida → tabla ya existe, columnas ya existen,
  backfill `DO NOTHING`. `migrate.ts` ni siquiera la re-aplica si está registrada.

## 3. Capa de datos — `src/lib/server/db/audit-assignment.ts` (nuevo)

```ts
import { getSql, type Sql } from '$lib/server/db/client';
import type { AuditType } from '$lib/audit-types';

export type AuditAssignment = { auditType: AuditType; techId: string };

/** Asignaciones por área de una auditoría. */
export async function listAuditAssignments(auditId: string): Promise<AuditAssignment[]>;

/** Tipos que un técnico tiene asignados en una auditoría (vacío = no asignado). */
export async function techAssignedTypes(auditId: string, techId: string): Promise<AuditType[]>;

/** Inserta las asignaciones (una por tipo) dentro de una tx de alta. */
export async function insertAuditAssignments(
  tx: Sql,
  auditId: string,
  assignments: AuditAssignment[]
): Promise<void>;

/** True si el técnico está asignado a ≥1 tipo de la auditoría. */
export async function techIsAssigned(auditId: string, techId: string): Promise<boolean>;
```

## 4. Alta de auditoría — un técnico por tipo

### 4.1 Schema (`src/lib/server/backoffice/schemas.ts`)

`createAuditSchema` cambia de un `assignedTechId` único a un **mapa tipo→tech**:

```ts
export const createAuditSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    newClient: newClientSchema.optional(),
    types: z.array(auditTypeSchema).min(1),
    segment: auditSegmentSchema,
    // #32: un técnico por tipo. Record<AuditType, uuid>.
    techByType: z.record(auditTypeSchema, z.string().uuid()),
    scheduledAt: z.string().min(1),
    cabResponses: z.record(z.unknown()).optional().default({})
  })
  .refine((d) => Boolean(d.clientId) !== Boolean(d.newClient), { /* … */ })
  // (R7-shape) cada tipo seleccionado tiene técnico, sin sobrantes:
  .refine(
    (d) => d.types.every((t) => d.techByType[t]) &&
           Object.keys(d.techByType).every((t) => d.types.includes(t as AuditType)),
    { message: 'Asigná un técnico por cada tipo seleccionado' }
  );
```

`form-parsers.ts` (`parseCreateAuditFromForm`) arma `techByType` leyendo inputs
`name="techByType[it]"`, `name="techByType[erp-tango]"`, etc.

### 4.2 `createAudit()` (`src/lib/server/backoffice/audits.ts`)

```ts
// Validación de especialidad por tipo (R7). `technicians` ya cargados o lookup.
for (const [type, techId] of Object.entries(data.techByType)) {
  const tech = await getUserById(techId);                 // AppUser
  if (!tech || !userCanUseAuditTypes([type as AuditType], tech)) {
    throw new ValidationError(`El técnico no tiene especialidad para ${type}`); // R7
  }
}

// Técnico líder determinístico = el del primer tipo en orden canónico (R10).
const leadType = data.types.slice().sort(canonicalTypeOrder)[0];
const leadTechId = data.techByType[leadType];

const [audit] = await tx`
  INSERT INTO audit (empresa_id, name, types, template_ids, segment, status,
                     assigned_tech_id, created_by, scheduled_at)
  VALUES (${clientId}, ${name}, ${data.types}, ${templateIds}::uuid[], ${data.segment},
          'borrador', ${leadTechId}, ${createdBy}, ${scheduledAt})
  RETURNING id`;

await insertAuditAssignments(                              // R8, R9
  tx, audit.id,
  data.types.map((t) => ({ auditType: t, techId: data.techByType[t] }))
);
// … upsertCabResponses / syncClientFromCab sin cambios
```

- **R8/R9:** una fila por tipo; en mixta los techs pueden diferir; en single-type
  hay una sola asignación. Todo dentro de la **misma tx** del alta.
- **R10:** `assigned_tech_id` = técnico del tipo líder (orden canónico estable,
  p. ej. `it` < `erp-tango` < `erp-estandar`), nunca nulo en auditorías nuevas.

### 4.3 UI (`src/routes/(app)/auditorias/new/+page.svelte`)

Donde hoy hay **un** `<select name="assignedTechId">`, se renderiza **un select
por cada tipo seleccionado** (reactivo a los checkboxes `types`):

```svelte
{#each selectedTypes as type}
  <label>
    <span>Técnico para {AUDIT_TYPE_LABELS[type]}</span>
    <select name={`techByType[${type}]`} required>
      {#each techniciansFor(type) as tech}
        <option value={tech.id}>{tech.name}</option>
      {/each}
    </select>
  </label>
{/each}
```

- `techniciansFor(type)` filtra `data.technicians` a los que pueden el tipo
  (UX: solo especialistas elegibles; el server revalida en R7).
- `data.technicians` se enriquece en el loader con `auditTypes` por técnico
  (extender `listTechnicians()` para devolver `audit_types`).

## 5. Form técnico — filtrado de secciones por especialidad asignada

### 5.1 Acceso (`assertFormAccess` en `load-form.ts`)

Se reemplaza el chequeo de **overlap** por **asignación efectiva** (R14, R22):

```ts
export async function assertFormAccess(audit, user): Promise<void> {
  if (user.role !== 'admin' && user.role !== 'tecnico') throw new AuditFormNotAllowedError();
  if (user.role === 'tecnico') {
    const assigned = await techAssignedTypes(audit.id, user.id);   // audit_assignment
    if (assigned.length === 0) throw new AuditFormNotAllowedError(); // R14
  }
  if (!FORM_EDITABLE_STATUSES.includes(audit.status)) throw new AuditFormNotEditableError();
}
```

### 5.2 Filtrado de secciones (R11–R13, R15)

`loadAuditForm` calcula el conjunto de `template_id` visibles para el usuario y
filtra las secciones:

```ts
// Tipos visibles: admin → todos los de la auditoría; técnico → sus asignados.
const visibleTypes = user.role === 'admin'
  ? audit.types
  : await techAssignedTypes(audit.id, user.id);
const visibleTemplateIds = await resolveTemplateIdsForTypes(visibleTypes);

// CAB compartido único (R15): una sola sección CAB para toda la auditoría,
// independientemente de cuántos templates la repliquen.
const sections = allSections.filter((s) =>
  s.code === 'CAB'
    ? isCanonicalCabSection(s)                 // se conserva UNA sola CAB
    : visibleTemplateIds.includes(s.templateId) // resto: solo área del usuario
);
```

- **CAB canónico (R15):** hay una `section` CAB por template; para no duplicarla
  se elige **una** (p. ej. la del template del tipo canónico presente, o se
  dedup por `code='CAB'` quedándose con la primera por `sort_order`). Las
  respuestas del CAB se persisten contra los `item_id` de esa CAB canónica.
- **Implementación de datos:** `listFormSections`/`listFormItems`
  (`audit-form.ts`) hoy hacen `JOIN section ON s.template_id = ANY(template_ids)`.
  Se añade un parámetro `templateIds`/`includeTypes` (o se filtra en memoria con
  `s.template_id`) para limitar a `visibleTemplateIds ∪ {CAB canónica}`. Mantener
  la firma compatible para admin (todos los tipos).

### 5.3 Por qué el área se deriva del `template_id`

Como `audit_type ↔ template ↔ section` es 1:1, no hace falta una columna nueva en
`section` ni en `audit_response`: el área de una sección es la del `audit_type`
cuyo `template_id` la contiene. Esto evita tocar el esquema de respuestas/scoring
(R24).

## 6. Estado "CAB confirmado": columna explícita vs flag derivado

**Decisión propuesta (sujeta a puerta): columna explícita en `audit`**
(`cab_confirmed_by`, `cab_confirmed_at`).

Alternativas consideradas:

| Opción | Cómo modela "confirmado" | Veredicto |
|---|---|---|
| **A. Columna en `audit`** (propuesta) | `cab_confirmed_by`/`cab_confirmed_at` nulos = no confirmado; set en confirm | **Elegida** |
| B. Flag derivado del progreso del CAB | "confirmado" = todos los ítems CAB requeridos respondidos | Descartada |
| C. Tabla `audit_cab_lock(audit_id PK, …)` | fila presente = bloqueado | Descartada |

- **Por qué A:** el bloqueo es una **acción explícita** del técnico ("confirmar
  CAB"), no una consecuencia del llenado — un derivado (B) bloquearía al primer
  técnico apenas complete los campos, sin intención, y reabriría si se borra un
  valor (estado no monotónico, mal para un lock). A registra **quién** y
  **cuándo** confirmó (necesario para R17/R18: solo el confirmador o admin
  reedita) con una sola fuente de verdad por auditoría. Es el patrón ya usado en
  el repo para estado puntual de la auditoría (`started_at`/`finished_at` en
  `018`, mismo `audit`). Coste: 2 columnas nulables, sin tabla extra.
- **Por qué no C:** una tabla 1:1 con `audit` es overhead frente a 2 columnas;
  no hay atributos extra del lock que justifiquen normalizar.
- **Por qué no B:** acopla bloqueo a scoring/progreso y viola la semántica de
  "confirmar" como decisión humana.

### 6.1 Confirmar y bloquear (R16–R20)

- **Acción de confirmar:** nuevo form-action en `form/+page.server.ts`
  (`confirmCab`) o endpoint, que:
  1. verifica que el usuario sea técnico asignado a la auditoría (o admin);
  2. verifica `cab_confirmed_at IS NULL` (idempotencia: si ya está confirmado,
     no-op / 409 controlado);
  3. `UPDATE audit SET cab_confirmed_by = $user, cab_confirmed_at = now()
     WHERE id = $id AND cab_confirmed_at IS NULL` (atómico, R17).
- **Solo-lectura del CAB (R18, R19):** en la persistencia de respuestas del form
  (la action/endpoint que guarda `audit_response`), SI el `item_id` pertenece a
  la **sección CAB** Y `cab_confirmed_at IS NOT NULL` Y el usuario **no** es
  `cab_confirmed_by` ni admin ENTONCES se rechaza/ignora esa respuesta (no se
  escribe). El render del form marca el CAB `readonly` para ese usuario
  (señal `cabLocked` en el page data).
- **Áreas propias intactas (R20):** el chequeo de lock aplica **solo** a ítems de
  la sección CAB; las secciones de área se guardan normalmente para el técnico
  asignado a ese tipo.
- `loadAuditForm` devuelve `cab: { locked: boolean; confirmedBy: string | null;
  canConfirm: boolean }` para que el `.svelte` muestre el botón "Confirmar CAB"
  (cuando `!locked` y el usuario puede) o el estado solo-lectura (cuando
  `locked`).

## 7. Guard de informes (`src/lib/server/api/guards.ts`)

`requireReportReadAccess` pasa de comparar `audit.assignedTechId === user.id` a
"técnico asignado a algún tipo". Como la firma recibe `audit: { assignedTechId }`,
se amplía para recibir también los `tech_id` asignados (o se consulta
`techIsAssigned(audit.id, user.id)`):

```ts
if (user.role === 'tecnico' &&
    assignedTechIds.includes(user.id) &&     // R23: cualquier técnico asignado
    report?.status === 'aprobado') {
  return user;
}
```

El caller (loader del informe) provee `assignedTechIds` desde
`listAuditAssignments`. Compatibilidad: para auditorías single-type el conjunto
contiene al `assigned_tech_id` (vía backfill), comportamiento idéntico.

## 8. Tabla de archivos a tocar

| Archivo | Acción | Cubre |
|---|---|---|
| `migrations/020_audit_assignment.sql` | **crear** — tabla + columnas CAB + backfill, idempotente | R1–R5, R26 |
| `src/lib/server/db/audit-assignment.ts` | **crear** — list/insert/techAssignedTypes/techIsAssigned | R8, R11, R14, R22, R23 |
| `src/lib/server/backoffice/schemas.ts` | **modificar** — `createAuditSchema.techByType` | R6, R7 |
| `src/lib/server/backoffice/form-parsers.ts` | **modificar** — parsear `techByType[...]` | R6 |
| `src/lib/server/backoffice/audits.ts` | **modificar** — validar especialidad, insertar asignaciones, lead tech; `listTechnicians()` con `audit_types` | R7–R10 |
| `src/routes/(app)/auditorias/new/+page.svelte` | **modificar** — un select por tipo | R6 |
| `src/routes/(app)/auditorias/new/+page.server.ts` | **modificar** — pasar `audit_types` a la vista | R6 |
| `src/lib/server/form/load-form.ts` | **modificar** — `assertFormAccess` por asignación + filtro de secciones + `cab` state | R11–R15, R19, R20 |
| `src/lib/server/db/audit-form.ts` | **modificar** — acotar secciones/ítems a `templateIds` visibles + CAB | R11, R12, R15 |
| `src/routes/(app)/auditorias/[id]/form/+page.server.ts` | **modificar** — action `confirmCab`; rechazo de edición CAB bloqueado | R16–R18 |
| `src/routes/(app)/auditorias/[id]/form/+page.svelte` | **modificar** — botón "Confirmar CAB" / estado solo-lectura | R16, R19 |
| guardado de `audit_response` (action/endpoint del form) | **modificar** — ignorar ítems CAB de no-confirmadores | R18, R20 |
| `src/lib/server/api/guards.ts` | **modificar** — `requireReportReadAccess` por asignación | R23 |
| loader del informe (`…/informe/[version]/+page.server.ts`) | **modificar** — proveer `assignedTechIds` al guard | R23 |
| `tests/**` (ver tasks.md) | **crear** — migración, alta, filtrado, bloqueo CAB, guards, no-regresión | R1–R26 |

## 9. Qué NO se toca (no-regresión, R24/R25)

- `src/lib/server/scoring/`, `src/lib/scoring/` — scoring intacto; índices
  `indice_it`/`indice_erp` calculados como hoy.
- `src/lib/informe/render*.ts`, render mixto (#19/#30), share público — informe
  unificado sin cambios.
- `audit_response`, `audit_section_score`, `audit_closure` — **sin** columnas de
  área nuevas (el área se deriva del `template_id`); estructura intacta.
- `audit.assigned_tech_id` — se conserva (técnico líder).

## 10. Alternativas descartadas

- **Mantener `assigned_tech_id` único y meter el "segundo técnico" en una
  columna nueva `assigned_tech_id_2`.** Descartada: no escala (¿y si mañana hay 3
  áreas?), no mapea técnico↔tipo (no se sabe quién hace qué), y rompe el filtrado
  por especialidad. `audit_assignment` normaliza la relación N:1 tipo→técnico.
- **Columna `audit_type` en `audit_response`/`section` para marcar el área.**
  Descartada: redundante — el área ya se deriva 1:1 del `template_id` de la
  sección; agregarla obligaría a backfill de respuestas y toca scoring (riesgo en
  R24). Se filtra por `template_id` sin tocar el esquema de respuestas.
- **CAB como un cuarto "template/tipo" compartido extraído.** Descartada para
  esta feature: implicaría re-modelar templates (cada template hoy trae su propia
  CAB). Se resuelve más barato deduplicando la sección `code='CAB'` en el load y
  bloqueando con `cab_confirmed_*`, sin migrar datos de templates.
- **Lock del CAB derivado del progreso (opción B, §6).** Descartada: el bloqueo
  es una decisión explícita, no monotónica con el llenado.
