# Review — feature 18

**Veredicto:** CHANGES_REQUESTED

## Trazabilidad

- R1: [x] `tests/api/mercado.test.ts` — 401/403/200; `e2e/mercado.spec.ts` — técnico sin link y 403
- R2: [x] `tests/mercado-aggregations.test.ts` — universe excluye no cerradas
- R3: [x] `tests/mercado-aggregations.test.ts` — ERP + bucket Sin dato
- R4: [x] `tests/mercado-aggregations.test.ts` — módulos Tango agregados
- R5: [x] `tests/mercado-aggregations.test.ts` — promedios global/segmento con NULLs
- R6: [x] `tests/mercado-aggregations.test.ts` — rubro + Sin rubro
- R7: [x] `tests/mercado-aggregations.test.ts` — semáforos y sin_dato
- R8: [x] `tests/mercado-aggregations.test.ts` — serie mensual 3 puntos
- R9: [x] `tests/mercado-aggregations.test.ts` — upsell total/avg/audits_with_findings
- R10: [x] `tests/api/mercado.test.ts` — payload anonimizado
- R11: [x] `tests/api/mercado.test.ts` — filtros solos y combinados
- R12: [x] `tests/api/mercado.test.ts` — filtros inválidos 400 apiError
- R13: [x] `tests/mercado-aggregations.test.ts` + `e2e/mercado.spec.ts` — degradación vacía
- R14: [x] `tests/mercado-aggregations.test.ts` — suppressed n<3 vs n=3
- R15: [x] `e2e/mercado.spec.ts` — secciones UI; `package.json` sin libs de charts
- R16: [x] `tests/api/mercado.test.ts` — solo GET exportado

## Tasks

- T1: [x] `src/lib/server/mercado/filters.ts` — entregado
- T2: [x] `src/lib/server/mercado/queries.ts` — entregado
- T3: [x] `src/lib/server/mercado/aggregate.ts` — entregado
- T4: [x] `tests/mercado-aggregations.test.ts` — entregado
- T5: [x] `src/routes/api/mercado/+server.ts` — entregado
- T6: [x] `tests/api/mercado.test.ts` — entregado
- T7: [x] componentes `mercado/{bar-chart,trend-chart,stat-card}.svelte` — entregado
- T8: [x] `mercado/+page.{server.ts,svelte}` — entregado
- T9: [x] link Mercado en `+layout.svelte` (solo admin) — entregado
- T10: [x] `e2e/mercado.spec.ts` — entregado
- T11: [ ] `specs/18_dashboard_mercado/tasks.md` sigue con T1–T11 en `[ ]`; `progress/impl_18_dashboard_mercado.md` creado en esta review

## Checkpoints

- C1: [x] Arnés completo; `./init.sh` exit 0 (555 passed, 2 skipped)
- C2: [x] Una feature `in_progress` (#18); tests mercado verdes
- C3: [x] SQL parametrizado en `queries.ts`; sin console.log en módulo mercado; sin secretos hardcodeados
- C4: [x] `tests/mercado-aggregations.test.ts`, `tests/api/mercado.test.ts`, `e2e/mercado.spec.ts`
- C5: [ ] `progress/current.md` aún describe sesión #17; actualizar al cerrar #18
- C6: [ ] `specs/18_dashboard_mercado/tasks.md` sin marcar `[x]` — bloquea cierre SDD

## Notas

- Import path en `mercado-aggregations.test.ts` corregido (`../src/...`); suite verde.
- Gráficos usan SVG con `var(--sys-*)` en componentes mercado; sin dependencias chart nuevas.
- OQ1 adoptado: upsell por volumen, sin campo `tipo`.

## Cambios requeridos

1. Marcar T1–T11 como `[x]` en `specs/18_dashboard_mercado/tasks.md`.
2. Actualizar `progress/current.md` (mover #17 a history si corresponde; vaciar plantilla o documentar cierre #18).
