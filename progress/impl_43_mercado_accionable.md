# Implementación — #43 43_mercado_accionable

Evolución **aditiva** de #18 sobre `/mercado` y `GET /api/mercado`. Cero migraciones, cero escritura,
sin tocar scoring. Universo intacto: `audit.status = 'cerrada'` + filtros (+ provincia nuevo).

## Archivos

### Nuevos
- `src/lib/server/mercado/classify.ts` — `classifyErp`, `classifyFinding`, `normalizeProvincia`, `NEA_PROVINCIAS`.
- `src/lib/components/mercado/grouped-bar.svelte` — barras apiladas SVG (ERP×rubro/segmento), tokens `--sys-*`, sin libs.
- `tests/fixtures/mercado-accionable.ts` — seed dedicado (`insertAccionableAudit`, `seedMercadoAccionable`).
- `tests/mercado-accionable.test.ts` — tests de dominio de los 5 bloques.

### Modificados
- `src/lib/server/mercado/filters.ts` — `provincia` en schema Zod + parseo.
- `src/lib/server/mercado/queries.ts` — `provincia` en CTE base (`baseAuditWhere`) + 10 queries nuevas.
- `src/lib/server/mercado/aggregate.ts` — tipos y armado de los 5 bloques; campos #18 intactos.
- `src/lib/server/db/empresa.ts` — `estadoSelectSql` exportado (fuente única de estado, R15).
- `src/routes/(app)/mercado/+page.server.ts` — `listMercadoProvincias` + opciones de provincia.
- `src/routes/(app)/mercado/+page.svelte` — filtro provincia + 5 secciones accionables.
- `tests/api/mercado.test.ts` — provincia (normalización) + anonimización de hallazgos.
- `e2e/mercado.spec.ts` — 5 bloques visibles + filtro provincia sin resultados.

## Trazabilidad R1–R20 ↔ test

- R1 (acceso solo admin) → `tests/api/mercado.test.ts > R1 — 401 sin sesión, 403 técnico, 200 admin`; `e2e/mercado.spec.ts > técnico no ve link Mercado y recibe 403`.
- R2 (universo solo cerradas filtradas) → `tests/mercado-accionable.test.ts > R2 — solo cuenta auditorías cerradas`; `tests/mercado-aggregations.test.ts > R2`.
- R3 (solo lectura, solo GET) → `tests/api/mercado.test.ts > R16 — solo GET exportado`; revisión: sin `migrations/` nuevas ni cambios en `src/lib/server/scoring/`.
- R4 (filtro provincia) → `tests/api/mercado.test.ts > R4 — filtro provincia normaliza ...`; `tests/mercado-accionable.test.ts > R4 — filtro provincia normaliza y reduce el universo`; `e2e > #43 — filtro provincia ...`.
- R5 (filtros inválidos 400) → `tests/api/mercado.test.ts > R12 — filtros inválidos responden 400 apiError`.
- R6 (ERP agrupado) → `tests/mercado-accionable.test.ts > R6 — distribución agrupada ...` y `> R6 — classifyErp agrupa ...`.
- R7 (cruce ERP×rubro/segmento con supresión) → `tests/mercado-accionable.test.ts > R7 — cruce ERP × rubro ...` y `> R7 — cruce ERP × segmento con supresión`.
- R8 (mapa NEA por provincia normalizada) → `tests/mercado-accionable.test.ts > R8 — mapa NEA ...` y `> R8 — normalizeProvincia ...`.
- R9 (cortes por rubro/segmento) → `tests/mercado-accionable.test.ts > R9 — conteos por rubro ... y por segmento`.
- R10 (avg ERP usuarios Tango) → `tests/mercado-accionable.test.ts > R10 — base instalada ...`; supresión en `> R17`.
- R11 (ranking módulos menos adoptados) → `tests/mercado-accionable.test.ts > R11 — ranking de módulos ...`; supresión en `> R17`.
- R12 (hallazgos por categoría, interno) → `tests/mercado-accionable.test.ts > R12 — hallazgos recurrentes ...` y `> R12 — classifyFinding ...`.
- R13 (nunca textos crudos) → `tests/api/mercado.test.ts > R13/R16 — el payload no expone textos de hallazgos ni identificadores`.
- R14 (empresas en riesgo) → `tests/mercado-accionable.test.ts > R14/R15 — riesgo/retención ...`.
- R15 (fuente única de estado, `estadoSelectSql`) → `tests/mercado-accionable.test.ts > R14/R15 ...` (override + auto-derivación); revisión: `fetchRiskRetention` compone `estadoSelectSql`, sin `CASE` nuevo; paridad SQL↔TS ya cubierta en `tests/empresa-estado.test.ts`.
- R16 (endpoint sin ids) → `tests/api/mercado.test.ts > R10 — respuesta anonimizada ...` y `> R13/R16 ...`.
- R17 (supresión n<3 en cortes comparativos) → `tests/mercado-accionable.test.ts > R17 — supresión n<3 ...`; cruce ERP en `> R7`.
- R18 (degradación con cero datos) → `tests/mercado-accionable.test.ts > R18 — universo vacío ...`; `e2e > #43 — filtro provincia ... estado vacío`.
- R19 (SVG/CSS tokens, sin libs) → `e2e/mercado.spec.ts > admin ve dashboard y secciones` (5 bloques) y `> #43 — filtro provincia y bloques accionables`; revisión: `package.json` sin libs de charts nuevas; `grouped-bar.svelte` SVG/CSS con `--sys-*`.
- R20 (no regresión #18) → `tests/mercado-accionable.test.ts > R20 — los campos del dashboard #18 se conservan`; suite #18 (`tests/mercado-aggregations.test.ts`, `tests/api/mercado.test.ts`) sigue verde.

## Desvíos respecto del design (justificados)

1. **Conteo del universo Tango (R10):** `tango_users_n` = nº de auditorías Tango del universo (no
   solo las que aportan al promedio). Los `indice_erp` NULL se excluyen del `AVG` (los excluye
   Postgres) pero cuentan en `n`, coherente con el test del spec ("promedio correcto con n≥3 con
   NULLs excluidos; suprimido con n=2") y con `installed_base.suppressed = tango_users_n < 3`.
2. **`listMercadoProvincias`** devuelve las provincias crudas del universo; la normalización/dedupe
   (`Sin dato` excluido, NEA primero) se hace en `+page.server.ts` con `normalizeProvincia`, una
   sola fuente de normalización (igual criterio que el resto de `classify.ts`).
3. **`baseAuditWhere`** centraliza el WHERE del universo (incluido el nuevo predicado de provincia)
   y se aplica también a las queries de #18 para que provincia recalcule **todos** los bloques (R4),
   sin cambiar resultados cuando el filtro está ausente (predicado no-op).

## Verificación (2026-06-24)

DB de test levantada con `docker compose up -d db` (servicio `db` en `localhost:5432`).

- **`pnpm run check`** → ✅ 0 errores, 41 warnings preexistentes (ninguno en archivos de #43).
- **Tests de #43 + #18 + relacionados (aislados)** → ✅ verde:
  - `tests/mercado-accionable.test.ts` (17), `tests/mercado-aggregations.test.ts` (10),
    `tests/mercado-queries.test.ts` (2), `tests/api/mercado.test.ts` (7).
  - Conjunto ampliado (mercado + empresa-estado/schema/compat/migration + crm-state-machine +
    pwa-prod): **87/87 verde**.
- **`pnpm exec playwright test e2e/mercado.spec.ts`** → ✅ **6/6 verde** (incluye el nuevo
  `#43 — filtro provincia y bloques accionables`). El `webServer` ejecuta `pnpm run build &&
  pnpm run preview`, por lo que el **build de producción también quedó verde**.

### `pnpm test` / `./init.sh` — flake pre-existente (NO #43)

La suite completa (`pnpm test`, 1267 tests) quedó **roja por flakiness pre-existente del arnés,
ajena a #43**, con fallos NO deterministas según el run:
- Run A: 3 fallos en `tests/pwa-prod.test.ts` (`response` undefined → `fetch` mockeado globalmente
  por otro test sin restaurar, que se filtra a `pwa-prod` bajo paralelismo de workers).
- Run B: 5 fallos (los 3 de `pwa-prod` + `crm-leads` con `Socket`/ECONNRESET de Postgres por
  contención de conexiones bajo carga).

Evidencia de que es ajeno a #43 y pre-existente:
- `pwa-prod` y `crm-state-machine` **pasan al correrse aislados** (87/87 arriba).
- `pwa-prod.test.ts` no importa nada de lo modificado en #43 (prueba assets estáticos de
  `build/client`); el mecanismo de falla (mock global de `fetch`) vive en tests de otras features
  (`reunion-*`, `form-autosave-*`, etc.), no tocados por #43.
- Los 1262 tests restantes (incluidos TODOS los de mercado/empresa) pasan en el run completo.

**Conclusión:** todo lo atribuible a #43 está verde (check, dominio, API, e2e, build). El rojo de
`init.sh` se debe a un problema de aislamiento de tests pre-existente del arnés (fuga de mock de
`fetch` a `pwa-prod` + contención de sockets Postgres bajo carga), que excede el alcance de #43
(«una feature a la vez»; no se tocan tests de otras features). Queda para el reviewer / puerta de
cierre decidir su tratamiento.
