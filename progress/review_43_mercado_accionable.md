# Review — feature 43 (43_mercado_accionable)

**Veredicto:** APPROVED
**Fecha:** 2026-06-24
**Revisor:** agente `reviewer`

> Nota: el reviewer NO marca `done` ni commitea. Queda pendiente la puerta humana.

## Verificación ejecutada

- `pnpm run check` → ✅ 0 errores, 41 warnings preexistentes (ninguno en archivos de #43).
- `pnpm exec vitest run` mercado (dominio + API + #18) → ✅ **36/36**
  (`mercado-accionable` 17, `api/mercado` 7, `mercado-aggregations` 10 [#18, no regresión], `mercado-queries` 2).
- `pnpm exec playwright test e2e/mercado.spec.ts` → ✅ **6/6** (incluye build de producción verde).

## Trazabilidad R1–R20 ↔ test (verificada, no solo declarada)

- R1 (acceso admin): `api/mercado > R1` (401/403/200) + `e2e > técnico 403`. ✅
- R2 (universo cerradas filtrado): `mercado-accionable > R2` (8 cerradas, 1 en_cierre excluida) + suite #18. ✅
- R3 (solo lectura/GET): `api/mercado > R16` (POST/PATCH/DELETE undefined) + revisión: 0 migraciones, 0 cambios en `scoring/`. ✅
- R4 (filtro provincia): `api/mercado > R4` (Chaco / "  chaco " / Mendoza) + `mercado-accionable > R4` + `e2e`. ✅
- R5 (filtros inválidos 400): `api/mercado > R12` (segment=Z, from=ayer, from>to). ✅
- R6 (ERP agrupado %): `mercado-accionable > R6` (tango3/comp3/sin_erp2, 37.5/37.5/25) + `classifyErp`. ✅
- R7 (cruce ERP×rubro/segmento + supresión): `mercado-accionable > R7` (Industria n3 desglose, Servicios n1 suppressed; segmentos A/B/C). ✅
- R8 (provincia normalizada + is_nea): `mercado-accionable > R8` (variantes colapsan, Sin dato) + `normalizeProvincia`. ✅
- R9 (cortes rubro/segmento): `mercado-accionable > R9`. ✅
- R10 (avg ERP Tango, NULLs fuera): `mercado-accionable > R10` (n3, avg 70). ✅
- R11 (ranking módulos menos adoptados): `mercado-accionable > R11` (adopted0/missing3 al tope, ventas 100%). ✅
- R12 (hallazgos por categoría, interno): `mercado-accionable > R12` + `classifyFinding`. ✅
- R13 (nunca textos crudos): `api/mercado > R13/R16` (secretos del seed ausentes del JSON serializado). ✅
- R14 (empresas en riesgo): `mercado-accionable > R14/R15` (ex_cliente1, inactiva2, at_risk2, universe8). ✅
- R15 (fuente única de estado): `mercado-accionable > R14/R15` (override + auto-derivación) + revisión: `fetchRiskRetention` compone `estadoSelectSql`, sin `CASE` nuevo. ✅
- R16 (endpoint sin ids): `api/mercado > R10` + `R13/R16` (razón social/cuit/referente/ids ausentes). ✅
- R17 (supresión n<3 cortes comparativos): `mercado-accionable > R17` (base instalada y riesgo/retención suprimidos con n2). ✅
- R18 (degradación universo vacío): `mercado-accionable > R18` + `e2e` (estado vacío). ✅
- R19 (SVG/CSS tokens, sin libs): `e2e` (5 bloques renderizan) + revisión: `package.json` sin cambios, `grouped-bar.svelte` SVG/CSS con `--sys-*`. ✅
- R20 (no regresión #18): `mercado-accionable > R20` + `mercado-aggregations` (#18) verde; campos #18 intactos en `MercadoDashboard`. ✅

## Invariantes duras del spec (todas verdes)

- Cero migraciones de schema → `git status migrations/` vacío. ✅
- Sin cambios en `src/lib/server/scoring/` → `git status` vacío. ✅
- Endpoint solo `GET` → `+server.ts` solo exporta `GET`. ✅
- Anonimización (R13/R16) → frontera en `aggregate.ts`; `fetchFindingsTexts` trae textos solo para clasificar y se descartan; ningún tipo nuevo expone razón social/cuit/ids/referentes/textos; test sobre JSON serializado. ✅
- Fuente única de estado (R15) → único cambio en `empresa.ts`: `function`→`export function estadoSelectSql`; `mercado/queries.ts` lo compone, sin `CASE` de estado nuevo. ✅
- Sin libs de charts (R19) → `package.json` sin dependencias nuevas. ✅
- Evolución aditiva (R20) → campos de #18 conservados. ✅
- Supresión n<3 y degradación universo vacío → implementadas y testeadas. ✅

## Tasks

- T1: [x] `classify.ts` (classifyErp/classifyFinding/normalizeProvincia/NEA_PROVINCIAS).
- T2: [x] `filters.ts` + `provincia`.
- T3: [x] `queries.ts` (CTE base con provincia + 9 queries nuevas + `listMercadoProvincias`).
- T4: [x] `estadoSelectSql` exportado + `fetchRiskRetention` (sin CASE nuevo).
- T5: [x] `aggregate.ts` (5 bloques, supresión, % sin div/0, ranking módulos, campos #18 intactos).
- T6: [x] `mercado-accionable.test.ts` + fixture `mercado-accionable.ts`.
- T7: [x] `api/mercado.test.ts` extendido (provincia, anonimización, 400, solo GET).
- T8: [x] `grouped-bar.svelte` SVG/CSS tokens.
- T9: [x] `+page.server.ts` (provincias) + `+page.svelte` (5 secciones + filtro).
- T10: [x] `e2e/mercado.spec.ts` (5 bloques, técnico 403, estado vacío).
- T11: [x] `impl_43_mercado_accionable.md` con mapa R↔test.

## Checkpoints

- C1: [x] arnés completo. C2: [x] solo #43 in_progress, tests asociados verdes.
- C3: [x] SQL parametrizado, sin ORM, sin console.log/TODOs, sin secretos.
- C4: [x] tests cubren funciones públicas; vitest >0 verde; e2e presente.
- C6: [x] spec EARS completo; todas las R cubiertas por ≥1 test.

## Flake del arnés (evaluado, NO bloqueante para #43)

`tests/pwa-prod.test.ts` (y a veces `crm-leads`) fallan de forma no determinista en la suite completa
(`pnpm test`). Evaluado como **PRE-EXISTENTE y ajeno a #43**:
- `pwa-prod.test.ts` levanta su propio server HTTP estático sobre `build/client`; no importa nada de #43.
- El fallo `response` undefined viene de fuga del mock global de `fetch` de tests de otras features
  (briefing/form-autosave/reunion/psys), NO tocados por #43. `crm-leads` es contención de sockets Postgres bajo paralelismo.
- #43 no modifica ningún test que stubee `fetch` global; sus tests nuevos (`mercado-accionable`,
  fixture) no usan mocks globales.
- Todo lo atribuible a #43 (check + dominio + API + e2e + build de prod) está verde aislado.

**Conclusión:** el rojo del flake en la suite completa NO es regresión de #43; es un problema de
aislamiento del arnés que excede el alcance «una feature a la vez». Se recomienda tratarlo como tarea
de arnés aparte, no bloquear #43.

## Cambios requeridos

Ninguno.
