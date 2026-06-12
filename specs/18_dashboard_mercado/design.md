# Design — #18 18_dashboard_mercado

## Alcance

Página backoffice solo-admin `/mercado` + endpoint `GET /api/mercado` que devuelve métricas
agregadas y anonimizadas sobre auditorías `cerradas`. Solo lectura: cero migraciones, cero
escritura. Las agregaciones se hacen en SQL directo sobre las tablas vivas (`audit`, `client`,
`audit_closure`, `audit_response`), no sobre el JSON canónico — el canónico es el contrato de
export por auditoría; para agregados cross-auditoría, SQL es más simple, más rápido y testeable.

| Incluido (MVP) | Excluido |
|---|---|
| Distribución ERP, módulos Tango, índices por segmento/rubro | Corte por zona/provincia (OQ2) |
| Semáforos IT/ERP, serie mensual, upsell agregado | Tipología de upsell (OQ1) |
| Filtros segment/rubro/from–to, supresión n<3 | Scores por sección/circuito (OQ3) |
| Gráficos SVG/CSS propios con tokens `--sys-*` | Libs de charts, export CSV/PDF, caching |

## Dependencias

| Feature | Contrato usado |
|---|---|
| `03_auth_roles` (#3) | `locals.user`, `requireAdminApi` (`src/lib/server/api/guards.ts`) |
| `08_cierre_scoring` (#8) | `indexToSemaphore` (`src/lib/server/scoring/semaphore.ts`) |
| `02/#9` captura | `client.*`, `audit_closure.*`, respuesta `cab_modulos_tango` (`ti.options->>'item_code' = 'cab_modulos_tango'`, mismo selector que `src/lib/server/canonical/build.ts:195`) |
| `11_ui_branding_sys` (#11) | Tokens `--sys-*` (`src/lib/styles/brand.css`), shell backoffice |

## Archivos

### Nuevos

```
src/lib/server/mercado/
├── queries.ts          # SQL de agregación (postgres.js, parametrizado)
├── aggregate.ts        # arma MercadoDashboard desde las filas SQL (supresión n<3, %)
└── filters.ts          # schema Zod de query params + parseo

src/routes/api/mercado/+server.ts        # GET (admin) → envelope { success, data }
src/routes/(app)/mercado/+page.server.ts # load: guard admin + misma agregación
src/routes/(app)/mercado/+page.svelte    # página: filtros + secciones
src/lib/components/mercado/
├── bar-chart.svelte       # barras horizontales SVG (ERP, módulos, rubros)
├── trend-chart.svelte     # serie mensual (polyline SVG)
└── stat-card.svelte       # tarjeta n/promedio/semáforo

tests/mercado-aggregations.test.ts   # R2–R9, R13, R14 (DB de test con seed)
tests/api/mercado.test.ts            # R1, R10, R11, R12, R16
e2e/mercado.spec.ts                  # R1 (link/acceso), R13 (estado vacío), R15
```

### Modificados

- `src/routes/(app)/+layout.svelte` (o donde viva la nav del backoffice): link «Mercado»
  visible solo para `admin`.

## Firmas

```ts
// src/lib/server/mercado/filters.ts
export const mercadoFiltersSchema = z.object({
  segment: z.enum(['A', 'B', 'C']).optional(),
  rubro: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
}).refine((f) => !f.from || !f.to || f.from <= f.to);
export type MercadoFilters = z.infer<typeof mercadoFiltersSchema>;
export function parseMercadoFilters(url: URL): MercadoFilters; // lanza MercadoInvalidFilterError

// src/lib/server/mercado/aggregate.ts
export type GroupStat = {
  key: string;            // 'A' | rubro | 'Sin rubro' | ...
  n: number;
  avg_it: number | null;  // null si suprimido o sin datos
  avg_erp: number | null;
  suppressed: boolean;    // n < MIN_GROUP_N (3) → true, sin promedios     (R14)
};
export type MercadoDashboard = {
  universe: { n: number; from: string | null; to: string | null };
  erp_distribution: Array<{ key: string; n: number; pct: number }>;       // R3
  modulos_tango: Array<{ key: string; n: number }>;                       // R4
  indices_global: { n_it: number; n_erp: number; avg_it: number | null; avg_erp: number | null };
  indices_by_segment: GroupStat[];                                        // R5
  indices_by_rubro: GroupStat[];                                          // R6
  semaforos: {
    it: { verde: number; amarillo: number; rojo: number; sin_dato: number };
    erp: { verde: number; amarillo: number; rojo: number; sin_dato: number };
  };                                                                      // R7
  monthly: Array<{ month: string; n: number; avg_it: number | null; avg_erp: number | null }>; // R8
  upsell_internal: { total: number; avg_per_audit: number | null; audits_with_findings: number }; // R9
};
export const MIN_GROUP_N = 3;
export async function buildMercadoDashboard(filters: MercadoFilters): Promise<MercadoDashboard>;
```

Notas de implementación:

- **Universo (R2, R11):** CTE base `audit JOIN client` con `status = 'cerrada'` + filtros;
  todas las queries agregan sobre esa CTE. Fechas filtran `closed_at`.
- **Módulos (R4):** `jsonb_array_elements_text(ar.value)` sobre la respuesta cuyo
  `template_item.options->>'item_code' = 'cab_modulos_tango'`, con guard
  `jsonb_typeof(ar.value) = 'array'`.
- **Semáforos (R7):** los cortes se aplican en TS con `indexToSemaphore` sobre conteos por índice
  (query devuelve los índices; clasificación reutiliza la función de #8 — una sola fuente de
  umbrales).
- **Upsell (R9):** `jsonb_array_length(ac.upsell_findings)`; nunca se devuelve el `text`.
- **Anonimización (R10):** `aggregate.ts` es la única frontera de salida; ningún tipo expone ids
  ni razón social. Test lo verifica sobre el JSON serializado.
- **Serie mensual (R8):** `date_trunc('month', closed_at)`; solo meses con datos (la UI dibuja
  huecos, no ceros falsos).

```ts
// src/routes/api/mercado/+server.ts
export const GET: RequestHandler; // requireAdminApi → parseMercadoFilters → buildMercadoDashboard
// 400 si MercadoInvalidFilterError (apiError); solo GET exportado (R16 → 405/404 en otros verbos)
```

## Errores

```ts
// src/lib/server/mercado/errors.ts (o dentro de filters.ts si queda corto)
export class MercadoInvalidFilterError extends Error { readonly code = 'MERCADO_INVALID_FILTER'; }
```

Reutiliza `apiError` y `requireAdminApi` existentes. Sin errores nuevos de DB: una agregación
sobre universo vacío devuelve estructura con `n: 0` (R13), no excepción.

## UI

- Página `/mercado` dentro del shell backoffice (#11): header, barra de filtros (select segmento,
  select rubro poblado con rubros distintos del universo, date pickers), grid de secciones.
- Gráficos: componentes SVG propios (<200 líneas c/u) con `--sys-*`; semáforos con los mismos
  colores token que el cierre/informe. Sin libs nuevas (R15) — el stack no tiene chart lib y
  agregar una (~100 KB+) no se justifica para barras y una polyline.
- Estado vacío: si `universe.n === 0`, mensaje único «No hay auditorías cerradas para estos
  filtros» y ninguna sección de gráfico (R13). Grupos `suppressed` muestran «muestra
  insuficiente (n < 3)» (R14).
- Filtros via querystring (`goto` con `searchParams`) → el `load` server recalcula; sin estado
  client-side duplicado.

## Alternativas descartadas

1. **Agregar sobre el JSON canónico (loop de `buildCanonicalAuditJson` por auditoría):**
   descartada — O(n) builds con N queries cada uno, y el canónico existe para export/IA por
   auditoría, no para analítica. SQL agregado es una query por métrica y testeable directo.
2. **Tabla materializada / snapshot de mercado:** descartada para el volumen actual (decenas de
   auditorías); agregación on-read es trivial. Revisitar si supera ~5k auditorías.
3. **Lib de charts (Chart.js / LayerChart / d3):** descartada — viola la regla de no sumar deps
   pesadas sin justificar; las visualizaciones requeridas son barras, donut opcional y una línea,
   resolubles en SVG con tokens de marca (consistente con cómo #14 resolvió el gauge del informe).
4. **Endpoint único reutilizado por página vía fetch client-side:** se mantiene el endpoint
   `GET /api/mercado` (testeable por integración, R10–R12) pero la página usa `+page.server.ts`
   llamando a la misma `buildMercadoDashboard` — evita un fetch extra y deja el guard de página
   (redirect a login) separado del guard de API (401/403).
