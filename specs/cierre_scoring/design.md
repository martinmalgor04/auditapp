# Design — cierre_scoring

## Alcance

Motor determinístico de scoring (ítem → sección → índice por plantilla), persistencia en `audit_section_score` y `audit_closure`, pantalla de cierre con campos cualitativos, preview legible del informe, confirmación y reapertura. Admin y técnico asignado operan el cierre; upsell es interno.

| Incluido (v1) | Excluido |
|---|---|
| Motor en `src/lib/server/scoring/` | Endpoint `/api/audits/[id]/export` (#9) |
| Reglas EOL + fallback edad | Scoring IA generativa inventario (v2) |
| Pantalla `/auditorias/[id]/cierre` | PDF branded / Loom (SPEC-08) |
| Preview HTML en app | `indice_global` (eliminado en #2) |
| Confirmar → `cerrada` + invalidar token | Regenerar token al reabrir (manual vía backoffice #4) |
| Reabrir admin → `en_cierre` | Edición manual de `audit_section_score.score` |
| API interna `computeLiveScores` (#7) | Dashboard comparativo entre auditorías (v2) |

## Dependencias

| Feature | Qué aporta |
|---|---|
| `modelo_datos` (#2) | Tablas, rúbrica en `options`, estados, `audit_closure` sin `indice_global` |
| `auth_roles` (#3) | Guards, invalidación token pattern |
| `backoffice` (#4) | Ruta base `auditorias/[id]`, transición relevamiento→cierre |
| `form_tecnico` (#7) | Consume `computeLiveScores`; observaciones por sección |
| `contrato_datos` (#9) | Reutilizará el mismo motor + builder JSON (futuro) |

## Arquitectura del motor (3 niveles)

```
audit_response + template_item + section
        │
        ▼
 scoreItem()          ── bool/tri/select/thresholds/table-EOL
        │
        ▼
 scoreSection()       ── Σ(puntos × item_weight) / Σ(weights)
        │
        ▼
 scoreTemplate()      ── Σ(section × weightFactor) / Σ(factors)
        │
        ▼
 scoreAudit()         ── map template.code → indice_it | indice_erp
```

**Mapa plantilla → índice:**

| `template.code` | Campo destino |
|---|---|
| `it` | `audit_closure.indice_it` |
| `erp-tango` | `audit_closure.indice_erp` |
| `erp-estandar` | `audit_closure.indice_erp` |

Auditoría combo IT+ERP: ambos índices poblados; si solo IT, `indice_erp = null`.

**Factores de peso (`section.weight`):**

```typescript
export const SECTION_WEIGHT_FACTORS = {
  bajo: 1,
  medio: 2,
  alto: 3,
  muy_alto: 5
} as const;
```

**Sección N/A completa:** todos los ítems con `scores=true` de la sección tienen respuesta `na=true` → se excluye del numerador y denominador del índice de plantilla.

## Archivos de dominio (`src/lib/server/scoring/`)

| Archivo | Responsabilidad |
|---|---|
| `types.ts` | `ItemScore`, `SectionScore`, `AuditScores`, `ScoreBreakdownEntry`, `Semaphore` |
| `constants.ts` | `SECTION_WEIGHT_FACTORS`, rangos semáforo, fallback edad por tipo equipo |
| `score-item.ts` | Puntaje por ítem según `field_type` + `options` + `value` |
| `score-section.ts` | Agregación ponderada ítems |
| `score-template.ts` | Índice plantilla con exclusiones CAB/N/A |
| `score-audit.ts` | Orquesta plantillas congeladas → `indice_it`/`indice_erp` |
| `inventory-eol.ts` | Reglas EOL fabricante + fallback antigüedad por fila |
| `semaphore.ts` | `indexToSemaphore(n: number): 'green' \| 'amber' \| 'red'` |
| `persist.ts` | Upsert `audit_section_score` + merge `audit_closure` índices |
| `live.ts` | `computeLiveScores(auditId)` sin side effects (para #7) |
| `preview.ts` | Builder de datos para preview (sin upsell) |
| `schemas.ts` | Zod: `top_risks`, `quick_wins`, `upsell_findings`, `next_step` |

Queries SQL en `persist.ts` o `src/lib/server/db/queries/scoring.ts` — parametrizadas, sin ORM.

## Firmas principales

### `score-item.ts`

```typescript
export type ScoreItemInput = {
  fieldType: FieldType;
  options: Record<string, unknown>;
  value: unknown;
  na: boolean;
  scores: boolean;
  required: boolean;
  itemWeight: number;
};

/** null = ítem no puntúa (informativo); 0|50|100 = madurez */
export function scoreItem(input: ScoreItemInput): {
  points: 0 | 50 | 100 | null;
  rule: string; // ej. "bool:true→100", "eol:vigente→100"
};
```

### `score-section.ts`

```typescript
export function scoreSection(
  items: Array<{ itemId: string; points: 0 | 50 | 100 | null; itemWeight: number }>
): { score: number; breakdown: ScoreBreakdownEntry[] };
```

### `score-audit.ts`

```typescript
export type AuditScoreResult = {
  sectionScores: Array<{ sectionId: string; code: string; score: number; breakdown: ScoreBreakdownEntry[] }>;
  indiceIt: number | null;
  indiceErp: number | null;
};

export function scoreAudit(
  frozenTemplateIds: string[],
  sections: SectionRow[],
  items: TemplateItemRow[],
  responses: AuditResponseRow[]
): AuditScoreResult;
```

### `persist.ts`

```typescript
export async function recalculateAndPersistScores(auditId: string): Promise<AuditScoreResult>;

export async function saveClosureFields(
  auditId: string,
  fields: ClosureFieldsInput,
  userId: string
): Promise<void>;

export async function confirmClosure(auditId: string, userId: string): Promise<void>;

export async function reopenAudit(auditId: string, adminUserId: string): Promise<void>;
```

### `live.ts`

```typescript
/** Misma lógica que scoreAudit; no escribe DB. */
export async function computeLiveScores(auditId: string): Promise<AuditScoreResult>;
```

### `preview.ts`

```typescript
export type ClosurePreview = {
  client: { razonSocial: string; cuit: string | null };
  indices: { it: number | null; erp: number | null; semaphores: Record<string, Semaphore> };
  sections: Array<{ code: string; title: string; score: number; semaphore: Semaphore }>;
  topRisks: TopRisk[];
  quickWins: string[];
  nextStep: string | null;
};

export async function buildClosurePreview(auditId: string): Promise<ClosurePreview>;
```

## Reglas EOL (`inventory-eol.ts`)

Por fila de tabla de inventario, evaluar en orden:

1. Si columna `soporte`/`eol_status` (según plantilla seed) indica `vigente` | `extendido` | `eol` → 100 | 50 | 0.
2. Si no hay dato de fabricante, calcular edad desde `fecha_compra` o `anio` vs fecha de visita (`audit.scheduled_at` o `now()` en tests con clock fijo).
3. Tipo de equipo desde columna `tipo` o `categoria`: mapear a familia `pc` vs `infra` para umbrales fallback del PRD.

Promedio de filas: `Math.round(sum / count)`; tabla vacía → puntaje ítem `null` (no penaliza sección si no hay filas).

## Rutas SvelteKit

```
src/routes/(app)/auditorias/[id]/cierre/
├── +page.server.ts    # load scores, closure fields, guards
├── +page.svelte       # form riesgos/wins/upsell/next_step + índices
├── preview/
│   ├── +page.server.ts
│   └── +page.svelte   # vista legible preview (R17)
└── actions: saveClosure, confirmClosure, reopenAudit (admin)
```

Transición `en_relevamiento → en_cierre`: acción en `auditorias/[id]` (backoffice #4) llama `recalculateAndPersistScores` antes de redirect a `/cierre`.

## JSON shapes persistidos

### `audit_closure.top_risks`

```json
[{ "text": "Sin MFA en correo", "severity": "alta" }]
```

### `audit_closure.quick_wins` / `upsell_findings`

```json
["Activar MFA gratuito en M365", "Renovar switch core EOL"]
```

## Errores

| Código / tipo | Cuándo | Respuesta HTTP |
|---|---|---|
| `AuditNotFoundError` | audit_id inválido | 404 |
| `AuditForbiddenError` | técnico no asignado | 403 |
| `InvalidAuditStateError` | acción fuera de máquina de estados | 409 |
| `ClosureValidationError` | Zod falla en save | 400 `{ success: false, error: { code, fields } }` |

Reutilizar errores de `auth/guards.ts` (#3) donde existan.

## Preview vs export (#9)

`buildClosurePreview` compone la vista humana. El JSON canónico con `schema_version`, `score_basis`, `market_data` y endpoint protegido lo implementa `contrato_datos` (#9) importando `scoreAudit` y ampliando el payload. No duplicar schema acá.

## Alternativas descartadas

### Índice global IT+ERP

**Descartado:** promedio o ponderación 50/50. PRD y #2 acordaron índices independientes; combos muestran dos números.

### Score manual por sección (SPEC-07e legacy)

**Descartado:** técnico ingresaba 0–100 en `audit_section_score`. v1 autocalcula; observaciones siguen editables.

### Bloqueo duro si faltan riesgos

**Descartado:** PRD mitiga con advertencia blanda (R18); no frenar cierre operativo.

### Preview = PDF

**Descartado:** v1 HTML en app; pipeline SPEC-08 genera entregable branded.
