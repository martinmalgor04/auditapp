# Design — #9 09_contrato_datos

## Alcance

Formaliza el **contrato JSON canónico v1** entre auditapp y consumidores aguas abajo (pipeline IA n8n, estudio de mercado NEA). Entrega builder tipado, esquema Zod, endpoint de export admin-only, extracción `market_data` y capa de preview compartida con la pantalla de cierre (#8).

| Incluido | Excluido |
|---|---|
| `buildCanonicalAuditJson`, `canonicalAuditSchema` | Generación informe branded / PDF / Loom (pipeline externo) |
| `GET /api/audits/[id]/export` + header versión | Dashboard métricas agregadas NEA (v2 backoffice) |
| `market_data` desnormalizado | API key / OAuth para export (v2) |
| `buildReportPreview` compartido con cierre | Persistir JSON en columna DB (se construye on-demand) |
| Tests contrato + snapshot | Consumidor n8n (se adapta al contrato SyS) |

## Dependencias

| Feature | Qué aporta |
|---|---|
| `02_modelo_datos` (#2) | Tablas `client`, `audit`, `audit_response`, `audit_section_score`, `audit_closure`, `attachment`; columnas de mercado en `client` |
| `03_auth_roles` (#3) | Guards `requireAdmin`, sesión en hooks |
| `06_storage_r2` (#6) | `r2_key` en `attachment` |
| `08_cierre_scoring` (#8) | Motor scoring determinístico, `score_breakdown`, pantalla cierre, `audit.status = cerrada` |

**Prerequisito duro:** `08_cierre_scoring` (#8) en `done`. Si #8 inlineó un builder parcial, esta feature lo reemplaza/consolida y reconecta el preview.

## Arquitectura

```
audit DB (cerrada)
       │
       ▼
buildCanonicalAuditJson(auditId)  ←── única fuente de agregación
       │
       ├──► canonicalAuditSchema.parse (validación frontera)
       │
       ├──► buildReportPreview(canonical) → pantalla cierre (#8)
       │
       └──► GET /api/audits/[id]/export (+ X-Schema-Version)
                    │
                    ▼
            pipeline IA / estudio mercado (consumidor externo)
```

## Archivos a crear/modificar

### Módulo canonical (`src/lib/server/canonical/`)

| Archivo | Propósito |
|---|---|
| `version.ts` | `export const CANONICAL_SCHEMA_VERSION = '1.0' as const` |
| `types.ts` | Tipos TS inferidos del schema Zod |
| `schema.ts` | `canonicalAuditSchema`, sub-schemas (`sectionSchema`, `marketDataSchema`, …) |
| `build.ts` | `buildCanonicalAuditJson(auditId): Promise<CanonicalAudit>` |
| `market-data.ts` | `extractMarketData(client, cabResponses): MarketData` |
| `preview.ts` | `buildReportPreview(canonical)`, `stripInternalFindings(canonical)` |
| `errors.ts` | `AuditNotClosedError`, `CanonicalBuildError` |

### API route

| Archivo | Propósito |
|---|---|
| `src/routes/api/audits/[id]/export/+server.ts` | GET export admin-only |

### Integración cierre (#8)

| Archivo | Cambio |
|---|---|
| `src/routes/(app)/auditorias/[id]/cierre/+page.server.ts` | Usar `buildReportPreview(await buildCanonicalAuditJson(id))` en load |
| Componente preview existente (#8) | Consumir view-model de `preview.ts`, no rearmar datos |

### Tests

| Archivo | Cubre |
|---|---|
| `tests/canonical-schema.test.ts` | R1, R16, R20 |
| `tests/canonical-builder.test.ts` | R2–R4, R9–R13, R18, R19 |
| `tests/canonical-preview.test.ts` | R14, R15 |
| `tests/canonical-contract.test.ts` | R10, R17 (snapshot + coherencia scores) |
| `tests/api/audit-export.test.ts` | R5–R8 |
| `tests/fixtures/canonical-audit-golden.json` | Fixture golden derivado de audit cerrada seed |
| `tests/fixtures/canonical-audit-golden.snapshot.json` | Snapshot vitest |

## Estructura JSON canónico v1

Referencia completa (campos obligatorios salvo donde se indica opcional):

```json
{
  "schema_version": "1.0",
  "audit_id": "uuid",
  "generated_at": "2026-06-08T14:30:00-03:00",
  "client": {
    "razon_social": "string",
    "cuit": "string",
    "rubro": "string",
    "segment": "A|B|C"
  },
  "types": ["it", "erp-tango"],
  "templates": [
    { "code": "it", "version": "v2" },
    { "code": "erp-tango", "version": "v2" }
  ],
  "sections": [
    {
      "code": "A1",
      "title": "string",
      "standard_ref": "string|null",
      "weight": "bajo|medio|alto|muy_alto",
      "score": 72,
      "score_basis": "auto",
      "observations": "string|null",
      "items": [
        {
          "item_id": "uuid",
          "label": "string",
          "field_type": "tri",
          "value": "parcial",
          "na": false,
          "score_contribution": 50,
          "observations": "string|null",
          "attachments": ["audits/{id}/A1/{uuid}"]
        }
      ]
    }
  ],
  "indices": { "it": 68, "erp": 72 },
  "top_risks": [
    { "text": "string", "severity": "baja|media|alta", "section": "A10" }
  ],
  "quick_wins": ["string"],
  "upsell_findings": [
    { "text": "string", "internal": true }
  ],
  "next_step": "string|null",
  "market_data": {
    "erp_actual": "string|null",
    "modulos_tango": ["ventas", "stock"],
    "empleados": 45,
    "puestos": 30,
    "sedes": 2,
    "proveedor_correo": "string|null",
    "soporte_it_actual": "string|null"
  },
  "closed_at": "2026-06-08T14:25:00-03:00"
}
```

### Reglas de mapeo

| Campo JSON | Origen |
|---|---|
| `client.*` | JOIN `audit` → `client`; `segment` desde `audit.segment` |
| `types` | `audit.types` |
| `templates` | JOIN `template` por `audit.template_ids` → `{ code, version }` |
| `sections` | Secciones de plantillas congeladas, orden `sort_order`; excluir `CAB` del array **o** incluirla con `score: null` y sin `score_basis` — **decisión: excluir CAB** (no puntúa, datos van a `client`/`market_data`) |
| `sections[].score` | `audit_section_score.score` |
| `sections[].score_basis` | Constante `"auto"` si `section.has_score` |
| `items[].value` | `audit_response.value` (última por `updated_at`, preferir `source=tecnico` sobre `cliente` en empate) |
| `items[].score_contribution` | `audit_section_score.score_breakdown[item_id]` |
| `items[].attachments` | `attachment.r2_key` WHERE `item_id` match |
| `indices.it` / `indices.erp` | `audit_closure.indice_it` / `indice_erp` |
| `top_risks`, `quick_wins`, `upsell_findings`, `next_step` | `audit_closure` JSONB/text |
| `closed_at` | `audit.closed_at` |
| `generated_at` | `new Date()` al momento del build (no persistido) |

### Mapeo market_data (§ R12)

| Clave `market_data` | Origen |
|---|---|
| `erp_actual` | `client.erp_actual` |
| `empleados` | `client.empleados` |
| `puestos` | `client.puestos` |
| `sedes` | `client.sedes` |
| `proveedor_correo` | `client.proveedor_correo` |
| `soporte_it_actual` | `client.soporte_it_actual` |
| `modulos_tango` | `audit_response.value` del ítem `template_item.item_code = 'cab_modulos_tango'` (multiselect `string[]`); si ausente → `null` |

> **Seed/plantilla:** el implementer verifica que la plantilla ERP (o CAB compartida) incluye ítem con `item_code = 'cab_modulos_tango'`. Si no existe en seed, añadir en migración/seed de plantillas (#2) como prerequisito de test, no nueva migración de schema.

## Firmas

```typescript
// version.ts
export const CANONICAL_SCHEMA_VERSION = '1.0' as const;

// schema.ts
export const canonicalAuditSchema: z.ZodType<CanonicalAudit>;
export type CanonicalAudit = z.infer<typeof canonicalAuditSchema>;

// build.ts
export async function buildCanonicalAuditJson(
  auditId: string
): Promise<CanonicalAudit>;

// market-data.ts
export function extractMarketData(
  client: ClientRow,
  cabResponses: Map<string, unknown>
): MarketData;

// preview.ts
export type ReportPreview = {
  indices: { it?: number; erp?: number };
  semaphore: { it?: 'green' | 'orange' | 'red'; erp?: 'green' | 'orange' | 'red' };
  topRisks: CanonicalAudit['top_risks'];
  quickWins: string[];
  upsellFindings: CanonicalAudit['upsell_findings'];
  nextStep: string | null;
  sectionsSummary: Array<{ code: string; title: string; score: number | null }>;
};

export function buildReportPreview(canonical: CanonicalAudit): ReportPreview;
export function stripInternalFindings(canonical: CanonicalAudit): CanonicalAudit;

// errors.ts
export class AuditNotClosedError extends Error {
  readonly code = 'AUDIT_NOT_CLOSED';
}
```

## Endpoint export

```
GET /api/audits/{id}/export
Authorization: cookie sesión admin
Response 200:
  Content-Type: application/json
  X-Schema-Version: 1.0
  Body: CanonicalAudit (JSON directo, sin envelope)
Response 401: sin sesión
Response 403: rol != admin
Response 404: audit inexistente o archivada
Response 409: audit.status != cerrada
```

**Decisión auth:** solo `admin` puede exportar (PRD 07i §9). Técnicos ven preview en pantalla cierre pero no descargan JSON crudo en v1.

## Preview compartido con cierre

La pantalla de cierre (#8) DEBE usar `buildReportPreview` alimentado por el mismo `buildCanonicalAuditJson` que el export. Flujo en `+page.server.ts`:

1. Verificar permiso admin/técnico y `status ∈ { en_cierre, cerrada }`.
2. Si `cerrada`: builder completo sin restricción.
3. Si `en_cierre`: builder en modo preview (mismos datos; export sigue bloqueado hasta `cerrada`).

Semáforo preview (hereda #8): 🟢 70–100 · 🟠 40–69 · 🔴 0–39.

## Versionado

| Tipo cambio | Acción |
|---|---|
| Campo opcional nuevo | MINOR (`1.0` → `1.1`); pipeline tolera desconocidos |
| Renombrar / quitar / cambiar tipo | MAJOR (`1.0` → `2.0`); coordinar pipeline |
| Cambio solo en preview UI | No afecta `schema_version` |

Documentar en comentario de `version.ts` y en este design.

## Errores

| Error | HTTP | Cuándo |
|---|---|---|
| `AuditNotFoundError` | 404 | ID inválido / archivada |
| `AuditNotClosedError` | 409 | Export con status ≠ cerrada |
| `ForbiddenError` (#3) | 403 | Rol no admin en export |
| `UnauthorizedError` (#3) | 401 | Sin sesión |
| `CanonicalBuildError` | 500 | Inconsistencia datos (log server, mensaje genérico cliente) |

Nunca exponer stack trace ni SQL en respuestas.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Persistir JSON en columna `audit_closure.canonical_json` | Duplica fuente de verdad; riesgo de drift con re-apertura/edición. On-demand desde DB es determinístico si scoring lo es. |
| Envelope `{ success, data }` en export | El contrato ES el payload; consumidores n8n esperan JSON plano versionado. |
| Auth export para técnico | PRD 07i cierra admin-only; técnico usa preview UI. v2 puede ampliar. |
| `score_basis: "manual"` en v1 | Reservado; scoring es 100% auto en MVP (#8). |
| API key en lugar de cookie | MVP usa sesión admin existente; API key es v2 cuando exista integración batch. |

## Nota pipeline (SPEC-08)

El pipeline IA y la base de estudio de mercado son **consumidores** de este contrato. No se formaliza SPEC-08 top-level; la relación queda documentada a nivel `sysaudit/`. El JSON se consume sin transformaciones manuales; cambios MAJOR requieren actualizar el workflow n8n.
