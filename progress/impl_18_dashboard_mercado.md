# Impl #18 — 18_dashboard_mercado

Feature: dashboard solo-admin de estudio de mercado NEA (métricas agregadas sobre auditorías cerradas).
Sin migraciones. Capa `src/lib/server/mercado/` + `GET /api/mercado` + página `/mercado`.

## Trazabilidad R → test

| Req | Descripción | Test(s) |
|-----|-------------|---------|
| R1 | Acceso solo admin | `tests/api/mercado.test.ts` — 401/403/200; `e2e/mercado.spec.ts` — link y 403 técnico |
| R2 | Solo auditorías cerradas | `tests/mercado-aggregations.test.ts` — universe.n=5 excluye no cerradas |
| R3 | Distribución ERP + Sin dato | `tests/mercado-aggregations.test.ts` — conteos Tango/Bejerman/Sin dato |
| R4 | Módulos Tango agregados | `tests/mercado-aggregations.test.ts` — ventas/stock/compras |
| R5 | Índices global y por segmento | `tests/mercado-aggregations.test.ts` — NULLs, n, avg segment A |
| R6 | Índices por rubro + Sin rubro | `tests/mercado-aggregations.test.ts` — Industria, Sin rubro |
| R7 | Semáforos IT/ERP | `tests/mercado-aggregations.test.ts` — verde/amarillo/rojo/sin_dato |
| R8 | Serie mensual | `tests/mercado-aggregations.test.ts` — 3 meses, promedios ene |
| R9 | Upsell agregado interno | `tests/mercado-aggregations.test.ts` — total, avg, audits_with_findings |
| R10 | Anonimización | `tests/api/mercado.test.ts` — payload sin razon_social/cuit/client_id/audit_id |
| R11 | Filtros segment/rubro/fechas | `tests/api/mercado.test.ts` — solos y combinados |
| R12 | Filtros inválidos → 400 | `tests/api/mercado.test.ts` — segment=Z, from=ayer, from>to |
| R13 | Degradación universo vacío | `tests/mercado-aggregations.test.ts` — n:0, null; `e2e/mercado.spec.ts` — empty state |
| R14 | Supresión n < 3 | `tests/mercado-aggregations.test.ts` — Agro suppressed, Servicios n=3 |
| R15 | UI SVG/CSS tokens --sys-* | `e2e/mercado.spec.ts` — secciones renderizadas; sin libs chart en package.json |
| R16 | Solo GET | `tests/api/mercado.test.ts` — POST/PATCH/DELETE undefined |

## Archivos nuevos

- `src/lib/server/mercado/{filters,queries,aggregate,errors}.ts`
- `src/routes/api/mercado/+server.ts`
- `src/routes/(app)/mercado/+page.{server.ts,svelte}`
- `src/lib/components/mercado/{bar-chart,trend-chart,stat-card}.svelte`
- `tests/mercado-aggregations.test.ts`
- `tests/api/mercado.test.ts`
- `tests/fixtures/mercado-audit.ts`
- `e2e/mercado.spec.ts`

## Archivos modificados

- `src/routes/(app)/+layout.svelte` — link «Mercado» solo admin

## Verificación

```
./init.sh → exit 0 (555 passed, 2 skipped)
pnpm run check → (incluido en gate del implementer)
e2e/mercado.spec.ts → cubierto en T11 del spec
```

## Notas

- `MIN_GROUP_N = 3` para supresión anonimato (R14).
- Upsell agregado por volumen, sin tipología (OQ1 del spec).
- Selector `cab_modulos_tango` alineado con canonical builder.
