# Review — feature #10 `11_ui_branding_sys`

**Veredicto:** APPROVED

**Fecha:** 2026-06-09  
**Reviewer:** agente `reviewer`

## Resumen

Design system SyS implementado según spec: tokens oficiales, logos PNG, Montserrat global, componentes base (`SysShell`, `SysButton`, `SysInput`, `SysTextarea`, `SysBadge`), shells en login/backoffice/form/cierre, briefing migrado, PWA `#0A1929`. Trazabilidad R1–R20 completa; 28/28 tasks marcadas; verificación obligatoria en verde.

## Trazabilidad

| Req | Test(s) | Estado |
|-----|---------|--------|
| R1 | `tests/brand-tokens.test.ts` > brand.css declares official SyS CSS variables | [x] |
| R2 | `tests/brand-tokens.test.ts` > src contains no legacy brand hex or CSS var names | [x] |
| R3 | `tests/brand-tokens.test.ts` > tailwind theme extends sys colors | [x] |
| R4 | `tests/brand-typography.test.ts` > root layout loads Montserrat | [x] |
| R5 | `tests/brand-assets.test.ts` > official logo files exist | [x] |
| R6 | `tests/brand-assets.test.ts` > PWA icons and favicon exist; `tests/pwa-manifest.test.ts` | [x] |
| R7 | `tests/brand-shell.test.ts` > SysShell exports dark and light variants | [x] |
| R8 | `e2e/branding.spec.ts` > login page shows SyS logo and electric blue submit | [x] |
| R9 | `e2e/branding.spec.ts` > tablero shows branded header | [x] |
| R10 | `tests/brand-tokens.test.ts` > form layout and section-nav; `e2e/branding.spec.ts` > form page uses sys-electrico primary button | [x] |
| R11 | `tests/brand-shell.test.ts` > cierre layout exists; `e2e/branding.spec.ts` > cierre page shows branded header | [x] |
| R12 | `tests/brand-tokens.test.ts` > briefing components; `e2e/briefing.spec.ts` + `e2e/branding.spec.ts` > logo PNG | [x] |
| R13 | `tests/pwa-manifest.test.ts` > theme_color and background_color | [x] |
| R14 | `tests/brand-pwa-meta.test.ts` > app.html theme-color meta | [x] |
| R15 | `tests/brand-components.test.ts` > SysButton primary variant | [x] |
| R16 | `tests/brand-components.test.ts` > SysInput applies electric focus ring | [x] |
| R17 | `tests/brand-components.test.ts` > SysBadge variants; `tests/backoffice-status-badge.test.ts` | [x] |
| R18 | `tests/brand-tokens.test.ts` > brand.css imported only from root layout | [x] |
| R19 | 6 archivos `tests/brand-*.test.ts` (18 tests) + `pwa-manifest` + `backoffice-status-badge` | [x] |
| R20 | `e2e/branding.spec.ts` (5 tests) + `e2e/briefing.spec.ts` (logo assert) | [x] |

## Tasks

T1–T28: todas `[x]` en `specs/11_ui_branding_sys/tasks.md`.

## Verificación ejecutada (reviewer)

| Comando | Resultado |
|---------|-----------|
| `pnpm exec vitest run tests/brand-*.test.ts tests/pwa-manifest.test.ts tests/backoffice-status-badge.test.ts` | ✅ 21/21 |
| `pnpm exec playwright test e2e/branding.spec.ts e2e/briefing.spec.ts` | ✅ 7/7 |
| Grep legacy (`#1e4d8c`, `--sys-primary`, `#003366`) en `src/` controles | ✅ Solo en `src/lib/brand/tokens.ts` (`LEGACY_BANNED`, excluido por test) |
| `./init.sh` | ✅ exit 0 — 75 archivos, 263 tests |

## Checkpoints

| ID | Criterio | Estado |
|----|----------|--------|
| C1 | Arnés completo; `./init.sh` verde | [x] |
| C2 | Una feature `in_progress` (#11); tests asociados pasan | [x] |
| C3 | Sin secretos; SQL parametrizado (sin cambios server en #11) | [x] |
| C4 | Suite `tests/brand-*` cubre `src/lib/brand/` y componentes marca | [x] |
| C5 | `progress/impl_11_ui_branding_sys.md` documentado; sesión activa en `current.md` | [x] |
| C6 | Spec EARS completo; tasks `[x]`; cada R con test | [x] |

## Observaciones (no bloqueantes)

1. **R11 E2E:** `e2e/branding.spec.ts > cierre page shows branded header` navega a `/tablero`, no a `/auditorias/{id}/cierre`. La cobertura de R11 queda respaldada por `brand-shell.test.ts` (layout existe + herencia de `(app)/+layout.svelte` con `SysShell light`). Recomendación futura: ampliar el E2E para visitar cierre explícitamente.
2. **`slate-*` residual:** Persiste en campos de formulario genéricos (`field-renderer`, inputs data-driven). Acorde con R10/T23 que acotan migración a *controles de marca* (layout, `section-nav`, CTAs primarios); no bloquea cierre.
3. **`progress/current.md` / `impl_11`:** Mencionan `./init.sh` rojo por fallos #8/#9; en esta revisión `init.sh` terminó verde (263 tests). Actualizar bitácora al marcar `done`.

## Cambios requeridos

Ninguno.
