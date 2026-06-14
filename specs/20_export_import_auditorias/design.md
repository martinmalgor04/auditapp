# Design — #20 20_export_import_auditorias

## Visión

Un **bundle JSON portable** que representa fielmente una auditoría completa y permite recrearla en
otra instancia. El único formato de identidad en el bundle es la **clave natural**; el import
resuelve esas claves a UUID locales del destino. Adjuntos viajan como referencias `r2_key`
(bucket R2 compartido). El import es transaccional, idempotente (dedupe por clave de bundle) y
admite un **dry-run** previo.

Capas (per `docs/architecture.md`):

- `src/lib/server/db/` — lectura/escritura SQL puro (postgres.js).
- `src/lib/server/bundle/` — dominio nuevo: build (export) + resolve/import + schema + errores.
- `src/routes/api/audits/...` — endpoints API admin-only.
- `src/routes/(app)/...` — UI backoffice (botón export, modal import con dry-run).

No reusa el formato canónico #9 como bundle (ver Alternativas). Reusa libremente helpers de
lectura DB existentes (`audits.ts`, `audit-form.ts`) y patrones del form export-import #7
(`src/lib/server/form/export-import.ts`).

---

## Esquema del bundle JSON (Zod)

`src/lib/server/bundle/schema.ts`:

```ts
import { z } from 'zod';

export const BUNDLE_SCHEMA_VERSION = '1.0' as const; // ≠ CANONICAL_SCHEMA_VERSION ('1.1')

// Clave natural de ítem (template_item NO tiene columna code) — ver §Remapeo.
const itemKeySchema = z.object({
  section_code: z.string(),
  field_type: z.string(),
  sort_order: z.number().int(),
  label: z.string()
});

const userRefSchema = z.object({ email: z.string().email() }).nullable();

const clientRefSchema = z.object({
  cuit: z.string().nullable(),
  razon_social: z.string(),
  // snapshot mínimo para match-or-create en modo permissive
  rubro: z.string().nullable().optional(),
  provincia: z.string().nullable().optional()
});

const templateRefSchema = z.object({ code: z.string(), version: z.string() });

const responseSchema = z.object({
  item_key: itemKeySchema,
  value: z.unknown(),          // jsonb; attachment_ids embebidos se remapean (R11)
  na: z.boolean(),
  observations: z.string().nullable(),
  source: z.enum(['admin', 'cliente', 'tecnico']),
  updated_by: userRefSchema
});

const sectionScoreSchema = z.object({
  template: templateRefSchema,   // a qué template pertenece la sección
  section_code: z.string(),
  score: z.number().int().min(0).max(100).nullable(),
  score_breakdown: z.unknown(),  // [{itemId,points}] — itemId NO se remapea: es local al cálculo
  observations: z.string().nullable()
});

const closureSchema = z.object({
  indice_it: z.number().int().min(0).max(100).nullable(),
  indice_erp: z.number().int().min(0).max(100).nullable(),
  top_risks: z.unknown(),
  quick_wins: z.unknown(),
  upsell_findings: z.unknown(),
  next_step: z.string().nullable(),
  closed_by: userRefSchema,
  closed_at: z.string().datetime().nullable()
}).nullable();

const attachmentRefSchema = z.object({
  origin_id: z.string().uuid(),  // SOLO para remapear attachment_ids embebidos; no se persiste
  r2_key: z.string().min(1),
  filename: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  kind: z.enum(['photo', 'export']),
  item_key: itemKeySchema.nullable(),
  uploaded_by: userRefSchema
});

export const auditBundleSchema = z.object({
  bundle_schema_version: z.literal(BUNDLE_SCHEMA_VERSION),
  dedupe_key: z.object({
    origin_instance_id: z.string(),
    origin_audit_id: z.string().uuid()
  }),
  exported_at: z.string().datetime(),
  header: z.object({
    name: z.string(),
    types: z.array(z.string()),
    templates: z.array(templateRefSchema),   // reemplaza template_ids[]
    segment: z.enum(['A', 'B', 'C']),
    status: z.enum([
      'borrador','briefing_enviado','briefing_completo','en_relevamiento','en_cierre','cerrada'
    ]),
    client: clientRefSchema,
    assigned_tech: userRefSchema,
    created_by: userRefSchema,
    scheduled_at: z.string().datetime().nullable(),
    closed_at: z.string().datetime().nullable()
    // public_token NO se exporta: es único por instancia, se regenera en destino.
    // archived_at NO se exporta: estado local de la instancia.
  }),
  responses: z.array(responseSchema),
  section_scores: z.array(sectionScoreSchema),
  closure: closureSchema,
  attachments: z.array(attachmentRefSchema)
});

export type AuditBundle = z.infer<typeof auditBundleSchema>;
```

`BUNDLE_SCHEMA_VERSION` vive en `src/lib/server/bundle/version.ts` (espejo de la política de
`canonical/version.ts`). `origin_instance_id` se lee de env `INSTANCE_ID` (fallback `'unknown'`);
es lo que hace estable el dedupe (R13).

---

## Archivos a crear

| Archivo | Responsabilidad | Firmas clave |
|---|---|---|
| `src/lib/server/bundle/version.ts` | Constante | `export const BUNDLE_SCHEMA_VERSION = '1.0'` |
| `src/lib/server/bundle/schema.ts` | Zod del bundle | `auditBundleSchema`, `type AuditBundle`, `itemKeySchema` |
| `src/lib/server/bundle/errors.ts` | Errores tipados | `AuditBundleResolutionError`, `AuditBundleValidationError`, `AuditBundleDuplicateError` |
| `src/lib/server/bundle/item-key.ts` | Clave estable de ítem | `resolveItemKey(item): ItemKey`; `itemKeyString(k): string` |
| `src/lib/server/bundle/build.ts` | Export → bundle | `buildAuditBundle(auditId: string): Promise<AuditBundle>` |
| `src/lib/server/bundle/resolve.ts` | Resolución clave natural→UUID local | `resolveBundle(b, mode): Promise<ResolutionReport>` |
| `src/lib/server/bundle/import.ts` | Import (dry-run + escritura) | `importAuditBundle(raw, user, mode): Promise<ImportResult>` |
| `src/routes/api/audits/[id]/bundle/export/+server.ts` | `GET` export admin | `GET` |
| `src/routes/api/audits/bundle/import/+server.ts` | `POST` import admin (dry-run/escritura) | `POST` |
| `src/routes/(app)/.../+page.svelte` (extensión UI) | Botón export + modal import | — |
| `migrations/011_audit_bundle_import.sql` | Tabla de dedupe (ver §Idempotencia) | — |

### Lectura DB (reusar / extender en `src/lib/server/db/`)

`src/lib/server/db/audit-bundle.ts` (nuevo, agrupa lecturas para el build y la resolución):

```ts
export async function loadAuditForBundle(auditId: string): Promise<AuditBundleRow | null>;
export async function loadResponsesWithItemKeys(auditId: string): Promise<ResponseWithKey[]>;
export async function loadSectionScoresWithCodes(auditId: string): Promise<ScoreWithCode[]>;
export async function loadClosure(auditId: string): Promise<ClosureRow | null>;
export async function loadAttachmentsWithItemKeys(auditId: string): Promise<AttachmentRow[]>;
// Resolución en destino:
export async function findClientByNaturalKey(c: ClientRef): Promise<{ id: string } | null>;
export async function findTemplateByCodeVersion(t: TemplateRef): Promise<{ id: string } | null>;
export async function buildItemKeyIndex(templateIds: string[]): Promise<Map<string, string>>;
export async function findUserByEmail(email: string): Promise<{ id: string } | null>;
```

`buildItemKeyIndex` hace el JOIN `template → section → template_item` y devuelve
`Map<itemKeyString, template_item.id>` para el/los template(s) involucrados — el corazón del
remapeo de ítems (R4).

### Escritura DB (en una sola transacción `sql.begin`)

`importAuditBundle` ejecuta toda la escritura dentro de `sql.begin(async (tx) => { ... })`
(patrón ya presente en `src/lib/server/db/crm-leads.ts`, `scoring/persist.ts`,
`backoffice/audits.ts`). Esto garantiza atomicidad (R14): cualquier throw revierte todo.

```ts
export async function importAuditBundle(
  raw: unknown,
  user: AppUser,
  mode: 'dry-run' | 'strict' | 'permissive'
): Promise<ImportResult>;

type ImportResult =
  | { mode: 'dry-run'; report: ResolutionReport }                      // R12
  | { mode: 'strict' | 'permissive'; auditId: string; duplicate: boolean; report: ResolutionReport };

type ResolutionReport = {
  client: { matched: boolean; willCreate: boolean };
  templates: Array<{ ref: TemplateRef; matched: boolean }>;
  sections: Array<{ section_code: string; matched: boolean }>;
  items: Array<{ item_key: ItemKey; matched: boolean }>;
  users: Array<{ email: string; matched: boolean }>;
  missing: string[];          // faltantes obligatorios enumerados (R15)
  would_create: string[];     // qué se crearía (audit, N responses, M attachments, ...)
};
```

---

## Estrategia de remapeo por clave natural

Orden de resolución (todo en lectura antes de escribir; en dry-run se detiene acá):

1. **Cliente** — match por `cuit` si no es null; fallback `razon_social` (case-insensitive).
   `strict`: si no hay match → `missing`. `permissive`: marcar `willCreate` (R17).
2. **Templates** — `findTemplateByCodeVersion({code,version})` por cada `header.templates[]`.
   Faltante = error obligatorio (R15). Resuelve `template_ids[]` local.
3. **Secciones** — implícitas vía `buildItemKeyIndex` (UNIQUE(template_id, code)); score por
   `section_code` resuelve `section.id` local. Sección faltante → `missing`.
4. **Ítems** — `buildItemKeyIndex` → `Map<itemKeyString, item.id>`. Cada `response.item_key` y
   cada `attachment.item_key` se traduce. Faltante = error obligatorio (R15).
5. **Usuarios** — `findUserByEmail` para `assigned_tech`, `created_by`, `updated_by`, `closed_by`,
   `uploaded_by`. Ausente: `NULL` (FK nullable) — no es faltante obligatorio (R17).

### Caso crítico: `template_item` no tiene `code`

`template_item` (001_schema.sql:47-74) carece de columna `code`, a diferencia de `section`
(UNIQUE(template_id, code)) y `template` ({code,version}). Es el punto **más frágil** del remapeo.

- **Clave elegida:** `{section_code, field_type, sort_order, label}` (R4). `section_code` localiza
  la sección; `sort_order` es el discriminador primario dentro de la sección; `field_type` y
  `label` agregan robustez ante reordenamientos puntuales.
- **Riesgo:** si en destino se editó el ítem (cambió `label`, `field_type`) o se reordenó
  (`sort_order`), la clave no matchea aunque el ítem "sea el mismo". Como templates son
  data-driven (filas en DB, no código), divergencias entre instancias son posibles.
- **Mitigación:** el import exige que **el mismo template (code+version)** exista en destino; bajo
  ese contrato `(section_code, sort_order)` es estable porque el seed del template es el mismo. El
  dry-run (R12) expone cualquier ítem no resuelto antes de escribir. `field_type`+`label` permiten
  detectar drift (match por `sort_order` pero `field_type` distinto → tratar como faltante).
- **Alternativa rechazada:** matchear por `(section_code, sort_order)` solo — más simple pero
  silencioso ante reordenamientos. Se prefiere la clave de 4 campos con verificación.
- Ver **Open Question OQ-1**.

### Remapeo de `attachment_ids` embebidos (R11)

`audit_response.value` embebe UUID de adjuntos del **origen**:
- `field_type` `file_ref` → `{ attachment_ids: [uuid] }` (`fileRefValueSchema`,
  `src/lib/server/storage/schemas.ts`).
- `field_type` `table` → `{ rows: [{ row_id, cells, attachment_ids: [uuid] }] }`
  (`src/lib/server/db/audit-responses.ts:55-64`).

El bundle incluye `attachment.origin_id` por cada adjunto. Durante la escritura el import
construye `Map<origin_attachment_id, new_attachment_id>` al insertar/relinkear `attachment`, y
**reescribe** los `attachment_ids` de cada `value` antes de insertar el `audit_response`. Esto es
imprescindible: sin el remapeo los `value` apuntarían a UUID inexistentes en destino.

`row_id` dentro de `table` se conserva tal cual (es un id local del jsonb, no FK).
`score_breakdown[].itemId` se conserva tal cual (es referencia interna del cálculo de score, no
una FK que el destino deba resolver — documentado como decisión).

---

## Modos de import

| Modo | Escribe | Cliente ausente | Usuario ausente | Template/ítem ausente |
|---|---|---|---|---|
| `dry-run` (R12) | No | reporta | reporta | reporta `missing` |
| `strict` (R15, R17) | Sí | falla (`missing`) | `NULL` | falla (`missing`) |
| `permissive` (R17) | Sí | crea por clave natural | `NULL` | falla (`missing`) — nunca se crean templates |

El `mode` llega en el body del POST (`z.enum(['dry-run','strict','permissive']).default('dry-run')`).
Template/ítem faltante **siempre** falla (no se inventan plantillas; son data-driven y deben
preexistir, per `docs/architecture.md` "No editar plantillas como código").

---

## Idempotencia y atomicidad

- **Dedupe (R13):** migración `011_audit_bundle_import.sql` crea
  `audit_bundle_import (origin_instance_id text, origin_audit_id uuid, audit_id uuid REFERENCES
  audit(id) ON DELETE CASCADE, imported_by uuid REFERENCES app_user(id), imported_at timestamptz
  DEFAULT now(), PRIMARY KEY (origin_instance_id, origin_audit_id))`. Antes de escribir, el import
  consulta esta clave; si existe, devuelve `{ duplicate:true, auditId }` sin crear nada.
  *Alternativa sin tabla* (reportar duplicado por nombre+cliente): rechazada — frágil, no
  distingue reimport legítimo de homónimos. La tabla es la fuente de verdad del round-trip.
- **Atomicidad (R14):** toda la escritura (insert en `audit_bundle_import`, `audit`,
  `audit_response`, `audit_section_score`, `audit_closure`, `attachment`) ocurre dentro de un único
  `sql.begin`. La verificación de dedupe se hace **dentro** de la transacción (insert con
  `ON CONFLICT DO NOTHING` sobre `audit_bundle_import` y `RETURNING` para detectar carrera).

---

## Errores nuevos (`src/lib/server/bundle/errors.ts`)

```ts
export class AuditBundleValidationError extends Error {
  readonly code = 'AUDIT_BUNDLE_VALIDATION';      // → 400
}
export class AuditBundleResolutionError extends Error {
  readonly code = 'AUDIT_BUNDLE_RESOLUTION';      // → 422
  constructor(public readonly missing: string[]) { super('Entidades faltantes en destino'); }
}
export class AuditBundleDuplicateError extends Error {
  readonly code = 'AUDIT_BUNDLE_DUPLICATE';       // (no se usa para fallar: se reporta duplicate:true)
}
```

Reutilizados: `AuditNotFoundError` (`src/lib/server/backoffice/errors.ts`) para export de id
inexistente; `requireAdminApi` (`src/lib/server/api/guards.ts`) para guards; `apiSuccess`/
`apiError` (`src/lib/server/api/envelope.ts`) para respuestas. Nunca exponer stack traces
(`docs/conventions.md`).

### Mapa de status HTTP

| Situación | Status |
|---|---|
| Sin sesión / rol ≠ admin | 401 / 403 (R2, R7) |
| Bundle inválido (Zod) | 400 (R8) |
| Auditoría a exportar no existe | 404 |
| Template/ítem/sección faltante (escritura) | 422 (R15) |
| Export/import OK (incl. duplicate) | 200 |

---

## Alternativas descartadas

1. **Reusar el export canónico #9 como bundle.** El canónico (`canonical/build.ts`,
   `CANONICAL_SCHEMA_VERSION='1.1'`) es derivado y lossy: usa codes pero descarta info necesaria
   para reconstrucción fiel (sin `attachment_ids` remapeables, sin todas las respuestas crudas,
   pensado para auditorías cerradas y pipeline IA). Forzarlo a round-trip lo contaminaría con
   campos de import. → Bundle propio (`auditBundleSchema`), reusando solo helpers de lectura DB.
2. **Embeber binarios de adjuntos (base64/ZIP de R2).** Infla el bundle órdenes de magnitud y
   duplica almacenamiento; el bucket R2 es compartido/accesible entre instancias (decisión de
   producto). → Solo referencias `r2_key` + metadata; relink por `r2_key` (R6, R11).
3. **Remapear por UUID / crear espejo de IDs en destino (`OVERRIDING SYSTEM VALUE`).** Insertar
   con los UUID de origen genera colisiones y rompe el supuesto de instancias independientes; no
   resuelve plantillas que difieren entre instancias. → Resolución por clave natural (R3, R4).
4. **ZIP multi-archivo en vez de JSON puro.** Añade dependencia de empaquetado, complica el dry-run
   (hay que descomprimir para validar) y la UI de carga. El bundle es un único JSON validable de
   una pasada. → JSON puro, como el form backup #7.
5. **Reusar `formBackupSchema` (#7) extendido.** Es parcial (solo respuestas, sin scores/cierre/
   adjuntos, sin claves naturales) y client-side. Extenderlo rompería su contrato v1.0. → Schema
   nuevo superset; se reutilizan patrones de `importFormBackup` (validación Zod → resolver →
   batch upsert).

---

## Open Questions — RESUELTAS en la puerta humana (2026-06-13, Martín)

- **OQ-1 (clave de ítem) — RESUELTA:** se acepta el contrato **"mismo template (code+version) ⇒
  mismos ítems"**. La clave `{section_code, field_type, sort_order, label}` es la de #20. No se
  agrega columna `code` a `template_item` en este scope; queda anotado como posible migración
  futura si en algún momento se permite editar ítems sin bumpear `version`. El import debe tratar
  como faltante (no como match) cualquier ítem cuyo `sort_order` coincida pero `field_type` difiera
  (detección de drift, R4).
- **OQ-2 (match de cliente) — RESUELTA:** match primario por CUIT, fallback razón social
  case-insensitive. El endpoint usa **`dry-run` como default**; la escritura **exige elegir
  `strict` | `permissive` explícitamente** en el body. `strict` no crea clientes; `permissive`
  crea el cliente ausente por su clave natural (R17).
- **OQ-3 (`public_token`) — RESUELTA:** en import se **regenera un token nuevo solo si
  `status ∈ {briefing_enviado, briefing_completo}`** y se deja `NULL` en el resto (incluida
  `cerrada`, donde el token ya fue invalidado per `docs/architecture.md`). El bundle nunca porta el
  `public_token` de origen.
