# Trazabilidad R → test — #42 42_rediseno_ui

| Req | Verificación |
|-----|--------------|
| R1 | `tests/ui/tokens.test.ts`, `e2e/ui-tokens.spec.ts` |
| R2 | `tests/ui/tokens.test.ts` (brand.css vars) |
| R3 | `tests/ui/tokens.test.ts` (tailwind keys), `pnpm run check` |
| R4 | `tests/ui/layout.test.ts`, `e2e/ui-layout.spec.ts` |
| R5 | `tests/ui/header-mobile.test.ts`, `e2e/ui-layout.spec.ts` |
| R6 | `tests/ui/sidebar.test.ts`, `e2e/ui-layout.spec.ts` |
| R7 | `tests/ui/bottom-nav.test.ts`, `e2e/ui-layout.spec.ts` |
| R8 | `e2e/ui-layout.spec.ts` |
| R9 | `tests/ui/tablero.test.ts`, `e2e/tablero.spec.ts` |
| R10 | `tests/ui/tablero.test.ts` (AuditCard), `e2e/tablero.spec.ts` |
| R11 | `tests/ui/tablero.test.ts` (tabla), `e2e/tablero.spec.ts` |
| R12 | `tests/ui/tablero.test.ts` (TableroHeader), `e2e/tablero.spec.ts` |
| R13 | `tests/ui/status-badge.test.ts` |
| R14 | `tests/ui/form-header.test.ts`, form `+page.svelte` |
| R15 | `tests/ui/section-chips.test.ts`, `e2e/form.spec.ts` |
| R16 | `tests/ui/question-card.test.ts`, `field-renderer.svelte`, `e2e/form.spec.ts` |
| R17 | `tests/ui/form-next.test.ts`, `e2e/form.spec.ts` |
| R18 | `tests/ui/mercado.test.ts` (StatCard) |
| R19 | `tests/ui/mercado.test.ts` (ErpDistribution) |
| R20 | `tests/ui/mercado.test.ts` (SectionScoreBar) |
| R21 | `tests/ui/chip-pill.test.ts`, `e2e/mercado.spec.ts` |
| R22 | `tests/ui/progress-bar.test.ts` |
| R23 | `tests/ui/chip-pill.test.ts` |
| R24 | `e2e/ui-layout.spec.ts`, `pnpm run check` |
| R25 | suite completa `pnpm test`, e2e specs |
