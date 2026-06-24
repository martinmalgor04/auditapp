# Tasks — #43 43_mercado_accionable

> Sin migraciones. Evolución aditiva de #18. Orden: clasificadores → filtros → queries → aggregate →
> API/UI → tests/e2e. Trazabilidad en `progress/impl_43_mercado_accionable.md`.

## Dominio server

- [x] T1 — Crear `src/lib/server/mercado/classify.ts`: `classifyErp` (tango/competidor/sin_erp),
  `classifyFinding` (backups/seguridad/licencias/hardware_eol/redes/otros), `normalizeProvincia` y
  `NEA_PROVINCIAS`. Cubre: R6, R8, R12.
- [x] T2 — Extender `src/lib/server/mercado/filters.ts`: agregar `provincia` al `mercadoFiltersSchema`
  y a `parseMercadoFilters`. Cubre: R4, R5.
- [x] T3 — Extender `src/lib/server/mercado/queries.ts`: agregar `provincia` a `toSqlFilters`/CTE base
  y crear `listMercadoProvincias`, `fetchErpRawForGrouping`, `fetchProvinciaDistribution`,
  `fetchCountsByRubro`, `fetchCountsBySegment`, `fetchTangoInstalledBase`, `fetchTangoModuleCatalog`,
  `fetchTangoModuleAdoption`, `fetchFindingsTexts`. Cubre: R2, R4, R6, R7, R8, R9, R10, R11, R12.
- [x] T4 — Exportar/componer `estadoSelectSql` desde `src/lib/server/db/empresa.ts` y crear
  `fetchRiskRetention` en `queries.ts` (empresas distintas con ≥1 cerrada; conteos ex_cliente /
  estado efectivo inactiva / unión) sin un `CASE` nuevo. Cubre: R14, R15.
- [x] T5 — Extender `src/lib/server/mercado/aggregate.ts`: tipos nuevos
  (`TangoOpportunity`/`NeaMap`/`InstalledBase`/`RecurringFindings`/`RiskRetention`) y armado de los
  5 bloques en `MercadoDashboard` (porcentajes sin div/0, supresión `MIN_GROUP_N`, ranking de módulos
  por adopción ascendente con `missing`, categorización vía `classify.ts`, sin textos ni ids en la
  salida). Mantener intactos los campos de #18. Cubre: R6, R7, R10, R11, R12, R13, R14, R16, R17, R18, R20.

## Tests de dominio

- [x] T6 — Crear `tests/mercado-accionable.test.ts` con seed propio (ERP variados Tango/SAP/Bejerman/
  Odoo/otros/NULL; provincias con variantes de caso/espacios + Sin dato; usuarios Tango con módulos
  faltantes y adoptados; top_risks/quick_wins con palabras clave y `otros`; empresas ex_cliente,
  inactiva por derivación, inactiva por override, activas; grupos n<3 y n≥3; universo vacío). Cubre:
  R2, R6, R7, R8, R9, R10, R11, R12, R14, R15, R17, R18, R20.

## API

- [x] T7 — Verificar/ajustar `src/routes/api/mercado/+server.ts` (solo `GET`, parse → build con los
  bloques nuevos) y extender `tests/api/mercado.test.ts`: 401/403/200; filtro `provincia` (incl.
  normalización) y combinados; filtros inválidos 400; verbos no-GET rechazados; payload sin
  `razon_social`/`cuit`/`empresa_id`/`audit_id`/referentes ni textos de hallazgos del seed. Cubre:
  R1, R3, R4, R5, R13, R16.

## UI

- [x] T8 — Crear `src/lib/components/mercado/grouped-bar.svelte` (barras agrupadas SVG con tokens
  `--sys-*`, sin libs) para el cruce ERP×rubro/segmento. Cubre: R19.
- [x] T9 — Extender `src/routes/(app)/mercado/+page.server.ts` (agregar `listMercadoProvincias` al
  load) y `+page.svelte`: filtro `provincia`, 5 secciones accionables (migración Tango, mapa NEA,
  salud base instalada, hallazgos recurrentes «solo SyS», riesgo/retención «solo SyS»), estado vacío
  y «muestra insuficiente (n < 3)» en cortes suprimidos; reutilizar componentes de #18. Cubre: R1,
  R4, R17, R18, R19, R20.

## E2E y cierre

- [x] T10 — Extender `e2e/mercado.spec.ts`: admin ve los 5 bloques con data del seed; técnico no ve el
  link ni accede; filtro sin resultados (p.ej. provincia inexistente) muestra el estado vacío. Cubre:
  R1, R18, R19.
- [x] T11 — Crear `progress/impl_43_mercado_accionable.md` con el mapa R1–R20 ↔ test y correr
  `./init.sh`, `pnpm run check`, `pnpm test`, `pnpm exec playwright test` en verde. Cubre:
  trazabilidad de R1–R20.
