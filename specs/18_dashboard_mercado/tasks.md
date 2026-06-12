# Tasks — #18 18_dashboard_mercado

> Sin migraciones. Orden: dominio server → API → UI → e2e. Trazabilidad en
> `progress/impl_18_dashboard_mercado.md`.

## Dominio server

- [ ] T1 — Crear `src/lib/server/mercado/filters.ts`: `mercadoFiltersSchema` (segment/rubro/from/to, refine `from <= to`), `parseMercadoFilters(url)` y `MercadoInvalidFilterError`. Cubre: R11, R12.
- [ ] T2 — Crear `src/lib/server/mercado/queries.ts`: CTE base (cerradas + filtros) y queries de distribución ERP, módulos Tango (`jsonb_array_elements_text` con guard de tipo, selector `cab_modulos_tango`), índices global/segmento/rubro, índices crudos para semáforos, serie mensual (`date_trunc('month', closed_at)`) y upsell (`jsonb_array_length`). Cubre: R2, R3, R4, R5, R6, R7, R8, R9.
- [ ] T3 — Crear `src/lib/server/mercado/aggregate.ts`: tipos `GroupStat`/`MercadoDashboard`, `MIN_GROUP_N = 3`, `buildMercadoDashboard(filters)` con porcentajes, buckets `Sin dato`/`Sin rubro`, clasificación de semáforos vía `indexToSemaphore` (#8), supresión `n < 3` y estructura vacía segura con universo 0. Sin ningún identificador de cliente en los tipos de salida. Cubre: R3, R4, R5, R6, R7, R8, R9, R10, R13, R14.
- [ ] T4 — Crear `tests/mercado-aggregations.test.ts` con seed propio (cerradas + no cerradas, NULLs en índices/rubro/erp_actual, grupos n<3, upsell vacío y poblado, 3 meses distintos). Cubre: R2, R3, R4, R5, R6, R7, R8, R9, R13, R14.

## API

- [ ] T5 — Crear `src/routes/api/mercado/+server.ts`: solo `GET`, `requireAdminApi` → `parseMercadoFilters` (400 con `apiError` si inválido) → `buildMercadoDashboard` → envelope success. Cubre: R1, R11, R12, R16.
- [ ] T6 — Crear `tests/api/mercado.test.ts`: 401 sin sesión, 403 técnico, 200 admin; filtros solos y combinados; filtros inválidos 400; verbos no-GET rechazados; payload serializado sin `razon_social`/`cuit`/`client_id`/`audit_id`/referentes del seed. Cubre: R1, R10, R11, R12, R16.

## UI

- [ ] T7 — Crear componentes `src/lib/components/mercado/{bar-chart,trend-chart,stat-card}.svelte` en SVG/CSS con tokens `--sys-*`, sin dependencias nuevas en `package.json`. Cubre: R15.
- [ ] T8 — Crear `src/routes/(app)/mercado/+page.server.ts`: guard admin (redirect/403 según patrón del backoffice) + `parseMercadoFilters` desde `url.searchParams` + `buildMercadoDashboard`; y `+page.svelte`: barra de filtros por querystring, secciones (ERP, módulos, índices por segmento/rubro, semáforos, evolución, upsell interno rotulado «solo SyS»), estado vacío con mensaje claro y «muestra insuficiente (n < 3)» en grupos suprimidos. Cubre: R1, R11, R13, R14, R15.
- [ ] T9 — Agregar link «Mercado» en la navegación del backoffice visible solo para rol `admin`. Cubre: R1.

## E2E y cierre

- [ ] T10 — Crear `e2e/mercado.spec.ts`: admin ve dashboard con data del seed (secciones renderizadas), técnico no ve el link y recibe 403/redirect, filtro sin resultados muestra estado vacío. Cubre: R1, R13, R15.
- [ ] T11 — Crear `progress/impl_18_dashboard_mercado.md` con el mapa R<n> ↔ test y correr `./init.sh`, `pnpm run check`, `pnpm test`, `pnpm exec playwright test` en verde. Cubre: trazabilidad de R1–R16.
