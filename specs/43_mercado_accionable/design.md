# Design — #43 43_mercado_accionable

## Alcance

Evolución **aditiva** de #18 sobre la misma página `/mercado` y el endpoint `GET /api/mercado`.
Cero migraciones, cero escritura: las agregaciones se hacen en SQL directo sobre tablas vivas
(`audit`, `empresa`, `audit_closure`, `audit_response`, `template_item`), igual que #18. El tipo
`MercadoDashboard` se **extiende** con cinco bloques nuevos; los campos de #18 se conservan (R20).

| Incluido (#43) | Excluido |
|---|---|
| 5 bloques accionables: migración Tango, mapa NEA, salud base instalada, hallazgos recurrentes, riesgo/retención | Abrir el universo a toda la base `empresa` (sigue `cerradas`) |
| Filtro `provincia` nuevo; supresión n<3 en cortes comparativos | Migraciones de schema, cambios de scoring, mutaciones |
| Categorización keyword de hallazgos (TS, conteos) | Exponer textos crudos de hallazgos / ids de empresa |
| Reutiliza `estadoSelectSql` para estado efectivo | Tercera derivación de estado, libs de charts |

## Dependencias

| Feature | Contrato usado |
|---|---|
| `18_dashboard_mercado` (#18) | `MercadoDashboard`, `GroupStat`, `MIN_GROUP_N`, `buildMercadoDashboard`, `parseMercadoFilters`, `MercadoInvalidFilterError`, componentes `mercado/*` |
| `23_crm_empresa_unificada` (#23) | `empresa.provincia`/`relacion`/`estado_override`; `estadoSelectSql` y `deriveEmpresaEstado`/`ACTIVITY_WINDOW_MONTHS` (paridad SQL↔TS) |
| `08_cierre_scoring` (#8) | `audit_closure.{indice_erp, top_risks, quick_wins, upsell_findings}`; `indexToSemaphore` |
| `03_auth_roles` (#3) | `requireAdminApi` (`src/lib/server/api/guards.ts`), `requireAdminPage` (`src/lib/server/backoffice/route-helpers.ts`), `apiError`/`apiSuccess` |

Formas de datos confirmadas (no se modifican):
- `audit_closure.top_risks` → `jsonb` array de `{ text: string, severity: 'baja'|'media'|'alta'|'critica' }`.
- `audit_closure.quick_wins` → `jsonb` array de `string`.
- `audit_closure.upsell_findings` → `jsonb` array (`{ text, internal }` o string; ya tratado solo por volumen en #18). #43 no expone su texto (R13).
- `cab_modulos_tango` → `template_item` con `options.item_code = 'cab_modulos_tango'` y `options.choices: string[]` (catálogo, p.ej. `ventas, compras, stock, tesorería, sueldos, punto_venta`).

## Archivos

### Modificados

```
src/lib/server/mercado/filters.ts    # + provincia (schema Zod + parseo)
src/lib/server/mercado/queries.ts    # + queries de los 5 bloques (CTE base con provincia)
src/lib/server/mercado/aggregate.ts  # + tipos y armado de los 5 bloques en MercadoDashboard
src/routes/(app)/mercado/+page.server.ts # provincias para el filtro (listMercadoProvincias)
src/routes/(app)/mercado/+page.svelte    # + 5 secciones accionables + filtro provincia
```

### Nuevos

```
src/lib/server/mercado/classify.ts   # classifyErp(), classifyFinding(), normalizeProvincia(), NEA set
src/lib/components/mercado/grouped-bar.svelte   # barras apiladas/agrupadas SVG (ERP×grupo, módulos)
tests/mercado-accionable.test.ts     # R6–R15, R17, R18, R20 (DB de test con seed)
```
(Si conviene, los nuevos tests pueden ir al archivo `tests/mercado-aggregations.test.ts` existente;
se mantiene separado para no inflar el de #18. Decisión del implementer.)

## Firmas

```ts
// src/lib/server/mercado/filters.ts (extiende el schema de #18)
export const mercadoFiltersSchema = z
  .object({
    segment: z.enum(['A', 'B', 'C']).optional(),
    rubro: z.string().min(1).optional(),
    provincia: z.string().min(1).optional(),          // #43 nuevo (R4)
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional()
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to);
export type MercadoFilters = z.infer<typeof mercadoFiltersSchema>;
```

```ts
// src/lib/server/mercado/classify.ts
export type ErpGroup = 'tango' | 'competidor' | 'sin_erp';
export function classifyErp(raw: string | null): ErpGroup;     // keyword: tango / sap|bejerman|odoo|... / vacío

export type FindingCategory =
  | 'backups' | 'seguridad' | 'licencias' | 'hardware_eol' | 'redes' | 'otros';
export function classifyFinding(text: string): FindingCategory; // keyword map; sin match → 'otros'

export const NEA_PROVINCIAS: readonly string[]; // ['chaco','corrientes','formosa','misiones'] (normalizadas)
export function normalizeProvincia(raw: string | null): { key: string; is_nea: boolean };
//   trim + colapso espacios + lower para comparar; key de display canónica; NULL/'' → { key:'Sin dato', is_nea:false }
```

```ts
// src/lib/server/mercado/aggregate.ts (tipos NUEVOS; MercadoDashboard se extiende con estos campos)
export type ErpGroupCount = { group: ErpGroup; n: number; pct: number };
export type MarketGroupCut = {                 // cruce ERP × rubro|segmento (R7)
  key: string; n: number;
  groups: Record<ErpGroup, number> | null;     // null si suppressed
  suppressed: boolean;                          // n < MIN_GROUP_N
};
export type CountBucket = { key: string; n: number };
export type ProvinciaBucket = { key: string; n: number; is_nea: boolean };
export type ModuleAdoption = { key: string; adopted: number; missing: number; adoption_pct: number };
export type FindingCount = { category: FindingCategory; n: number };

export type TangoOpportunity = {
  overall: ErpGroupCount[];                     // R6
  by_rubro: MarketGroupCut[];                   // R7
  by_segment: MarketGroupCut[];                 // R7
};
export type NeaMap = {
  by_provincia: ProvinciaBucket[];              // R8
  by_rubro: CountBucket[];                      // R9 (bucket 'Sin rubro')
  by_segment: CountBucket[];                    // R9
};
export type InstalledBase = {
  tango_users_n: number;
  avg_erp: number | null;                       // null si suppressed o sin datos (R10)
  suppressed: boolean;                          // tango_users_n < MIN_GROUP_N
  modules: ModuleAdoption[];                    // [] si suppressed (R11)
};
export type RecurringFindings = {               // R12/R13 — interno
  internal: true;
  top_risks: FindingCount[];                    // ranking desc por frecuencia
  quick_wins: FindingCount[];
  total_risks: number;
  total_quick_wins: number;
};
export type RiskRetention = {                   // R14/R15 — interno
  internal: true;
  universe_empresas: number;                    // empresas distintas con ≥1 cerrada en el universo
  ex_cliente: number | null;                    // null si suppressed
  inactiva: number | null;
  at_risk: number | null;                       // unión distinta
  suppressed: boolean;                          // universe_empresas < MIN_GROUP_N
};

export type MercadoDashboard = {
  // ── campos #18 (se conservan, R20) ──
  universe: { n: number; from: string | null; to: string | null };
  erp_distribution: Array<{ key: string; n: number; pct: number }>;
  modulos_tango: Array<{ key: string; n: number }>;
  indices_global: { n_it: number; n_erp: number; avg_it: number | null; avg_erp: number | null };
  indices_by_segment: GroupStat[];
  indices_by_rubro: GroupStat[];
  semaforos: { it: SemaphoreCounts; erp: SemaphoreCounts };
  monthly: Array<{ month: string; n: number; avg_it: number | null; avg_erp: number | null }>;
  upsell_internal: { total: number; avg_per_audit: number | null; audits_with_findings: number };
  // ── bloques #43 (nuevos) ──
  tango_opportunity: TangoOpportunity;          // R6, R7
  nea_map: NeaMap;                              // R8, R9
  installed_base: InstalledBase;               // R10, R11
  recurring_findings: RecurringFindings;       // R12, R13
  risk_retention: RiskRetention;               // R14, R15
};

export async function buildMercadoDashboard(filters: MercadoFilters): Promise<MercadoDashboard>;
```

```ts
// src/lib/server/mercado/queries.ts (queries NUEVAS; todas con la CTE base cerradas+filtros+provincia)
export function listMercadoProvincias(): Promise<Array<{ key: string; is_nea: boolean }>>;
export function fetchErpRawForGrouping(f: MercadoFilters):
  Promise<Array<{ erp_actual: string | null; rubro: string | null; segment: string | null }>>; // R6, R7
export function fetchProvinciaDistribution(f: MercadoFilters): Promise<Array<{ provincia: string | null; n: number }>>; // R8
export function fetchCountsByRubro(f: MercadoFilters): Promise<CountBucket[]>;   // R9
export function fetchCountsBySegment(f: MercadoFilters): Promise<CountBucket[]>; // R9
export function fetchTangoInstalledBase(f: MercadoFilters):
  Promise<{ n: number; avg_erp: number | null }>;                               // R10
export function fetchTangoModuleCatalog(f: MercadoFilters): Promise<string[]>;   // catálogo (R11)
export function fetchTangoModuleAdoption(f: MercadoFilters): Promise<Array<{ modulo: string; n: number }>>; // R11
export function fetchFindingsTexts(f: MercadoFilters):
  Promise<{ topRisks: string[]; quickWins: string[] }>;                          // R12 (solo textos para clasificar en TS, nunca al payload)
export function fetchRiskRetention(f: MercadoFilters):
  Promise<{ universe_empresas: number; ex_cliente: number; inactiva: number; at_risk: number }>; // R14/R15
```

## Notas SQL

- **CTE base (R2, R4):** todas las queries parten de
  `audit a JOIN empresa c ON c.id = a.empresa_id WHERE a.status = 'cerrada'` + filtros
  `segment`/`rubro`/`from`/`to` (igual que #18) **+** filtro de provincia normalizado:
  `(${provincia}::text IS NULL OR lower(regexp_replace(btrim(c.provincia),'\s+',' ','g')) = lower(regexp_replace(btrim(${provincia}),'\s+',' ','g')))`.
  Reusar el helper `toSqlFilters` extendiéndolo con `provincia`.
- **Migración Tango (R6/R7):** se trae `erp_actual`, `rubro`, `segment` por auditoría con
  `fetchErpRawForGrouping` y la agrupación `tango/competidor/sin_erp` se hace en TS con
  `classifyErp` (una sola fuente de clasificación, testeable). El cruce por rubro/segmento se arma
  en TS aplicando `MIN_GROUP_N` (R17). Alternativa SQL puro descartada abajo.
- **Provincia (R8):** `GROUP BY` sobre la provincia cruda; la normalización/bucket `Sin dato`/flag
  NEA se resuelve en TS con `normalizeProvincia` (variantes colapsan al agregar en TS por `key`).
- **Salud base instalada (R10):** filtro adicional en SQL por "usuario Tango" con el mismo criterio
  keyword que `classifyErp` (`lower(erp_actual) LIKE '%tango%'`), `AVG(ac.indice_erp)` + `COUNT`;
  la supresión n<3 se aplica en TS.
- **Módulos (R11):** catálogo desde
  `SELECT DISTINCT jsonb_array_elements_text(ti.options->'choices') FROM template_item ti WHERE ti.options->>'item_code' = 'cab_modulos_tango'`
  (restringido a los `template_ids` del universo Tango). Adopción reutiliza el desagregado de #18
  (`jsonb_array_elements_text(ar.value)` con guard `jsonb_typeof(ar.value) = 'array'`, selector
  `cab_modulos_tango`) acotado a auditorías Tango. `missing = n_tango − adopted`; orden por
  adopción ascendente en TS.
- **Hallazgos (R12/R13):** `jsonb_array_elements` sobre `top_risks` (extrae `->>'text'`) y
  `jsonb_array_elements_text` sobre `quick_wins`; los textos solo viajan a TS para `classifyFinding`
  y se descartan tras contar — **nunca** se incluyen en `MercadoDashboard` (frontera en
  `aggregate.ts`).
- **Riesgo/retención (R14/R15):** componer el `estadoSelectSql` existente
  (`src/lib/server/db/empresa.ts`) en una CTE `est` y unirla a las empresas **distintas** con ≥1
  auditoría cerrada del universo:
  `SELECT COUNT(DISTINCT e.id) ..., COUNT(DISTINCT e.id) FILTER (WHERE e.relacion='ex_cliente'), COUNT(DISTINCT e.id) FILTER (WHERE est.estado='inactiva'), COUNT(DISTINCT e.id) FILTER (WHERE e.relacion='ex_cliente' OR est.estado='inactiva')`.
  Si `estadoSelectSql` no es exportable, se exporta desde `empresa.ts` para reutilizarlo sin copiar
  el `CASE` (mandato de fuente única, R15). La supresión por `universe_empresas < 3` se aplica en TS.
- **Anonimización (R16):** `aggregate.ts` es la única frontera de salida; ningún tipo nuevo expone
  ids, razón social, cuit ni textos de hallazgos. Test sobre el JSON serializado.

## Endpoint y página

```ts
// src/routes/api/mercado/+server.ts — sin cambios estructurales (#18): GET admin → parse → build.
// src/routes/(app)/mercado/+page.server.ts — agrega listMercadoProvincias() al load (selector de filtro).
```
- Página `/mercado`: se reordena para priorizar los bloques accionables (migración Tango, mapa NEA,
  salud base instalada, hallazgos recurrentes interno, riesgo/retención interno) reutilizando
  `StatCard`/`ErpDistribution`/`bar-chart`/`SectionScoreBar` de #18 y un `grouped-bar.svelte` nuevo
  para el cruce ERP×rubro/segmento. Bloques marcados `internal` se rotulan «solo SyS». Estado vacío
  único cuando `universe.n === 0` (R18); cortes `suppressed` muestran «muestra insuficiente (n < 3)».
- Filtro `provincia` como `<select>` poblado con `listMercadoProvincias()` (querystring → `load`),
  consistente con el patrón de filtros por querystring de #18.

## Errores

Reutiliza `MercadoInvalidFilterError` (#18), `apiError`, `requireAdminApi`/`requireAdminPage`. Sin
errores nuevos: un universo vacío devuelve la estructura con `n:0`/`null`/`[]` (R18), no excepción.

## Alternativas descartadas

1. **Abrir el universo a toda la base `empresa`:** descartada en la puerta humana — el denominador
   sigue siendo `cerradas` para mantener comparabilidad con #18 y no inflar métricas con prospectos
   nunca auditados.
2. **Clasificar ERP / hallazgos / provincia en SQL (CASE + LIKE):** descartada — la lógica de
   keywords y normalización es más testeable y mantenible en TS (`classify.ts`), una sola fuente; el
   SQL solo trae filas crudas del universo. El volumen (decenas de auditorías) lo hace trivial.
3. **Reimplementar la derivación de estado con un nuevo `CASE` SQL en `mercado/queries.ts`:**
   descartada — violaría la fuente única (R15). Se reutiliza `estadoSelectSql`, ya con paridad
   SQL↔TS testeada.
4. **Romper el contrato de #18 y reescribir `MercadoDashboard`:** descartada — la evolución es
   aditiva (R20) para no regresar los tests/UI de #18; los bloques nuevos conviven con los previos.
5. **Lib de charts (Chart.js / d3):** descartada (igual que #18) — barras y barras agrupadas se
   resuelven en SVG con tokens `--sys-*`.
6. **Exponer textos de hallazgos para que la UI categorice:** descartada — viola R13/R16; la
   categorización ocurre en server y solo viajan conteos.
