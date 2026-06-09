# Implementación — #11 11_ui_branding_sys

**Feature:** Branding SyS global (UI)  
**Estado:** implementación completa — pendiente reviewer  
**Fecha:** 2026-06-09

## Resumen

Design system SyS unificado: tokens oficiales en `brand.css` + Tailwind, logos PNG en `static/brand/`, Montserrat global, componentes `SysShell`/`SysButton`/`SysInput`/`SysTextarea`/`SysBadge`, shells en login/backoffice/form/cierre, briefing migrado a tokens + logo PNG, PWA `#0A1929`.

## Trazabilidad R → test

| Req | Descripción | Test(s) |
|-----|-------------|---------|
| R1 | Variables CSS oficiales | `tests/brand-tokens.test.ts` > brand.css declares official SyS CSS variables |
| R2 | Sin tokens legacy | `tests/brand-tokens.test.ts` > src contains no legacy brand hex or CSS var names |
| R3 | Tailwind sys.* | `tests/brand-tokens.test.ts` > tailwind theme extends sys colors |
| R4 | Montserrat global | `tests/brand-typography.test.ts` > root layout loads Montserrat |
| R5 | Logos static/brand | `tests/brand-assets.test.ts` > official logo files exist |
| R6 | Favicon e íconos PWA | `tests/brand-assets.test.ts` > PWA icons and favicon exist |
| R7 | SysShell dark/light | `tests/brand-shell.test.ts` > SysShell exports dark and light variants |
| R8 | Shell login | `e2e/branding.spec.ts` > login page shows SyS logo and electric blue submit |
| R9 | Shell backoffice | `e2e/branding.spec.ts` > tablero shows branded header |
| R10 | Form tokens unificados | `tests/brand-tokens.test.ts` > form layout and section-nav; `e2e/branding.spec.ts` > form page uses sys-electrico primary button |
| R11 | Shell cierre | `tests/brand-shell.test.ts` > cierre layout exists; hereda SysShell de `(app)/+layout.svelte`; `e2e/branding.spec.ts` > cierre page shows branded header |
| R12 | Briefing tokens + logo | `tests/brand-tokens.test.ts` > briefing components; `e2e/briefing.spec.ts` + `e2e/branding.spec.ts` > logo `/brand/sys-horizontal-b.png` |
| R13 | Manifest theme | `tests/pwa-manifest.test.ts` > theme_color and background_color |
| R14 | Meta theme-color | `tests/brand-pwa-meta.test.ts` > app.html theme-color meta |
| R15 | SysButton primary | `tests/brand-components.test.ts` > SysButton primary variant |
| R16 | SysInput focus ring | `tests/brand-components.test.ts` > SysInput applies electric focus ring |
| R17 | SysBadge semáforo | `tests/brand-components.test.ts` > SysBadge variants; `tests/backoffice-status-badge.test.ts` |
| R18 | brand.css import único | `tests/brand-tokens.test.ts` > brand.css imported only from root layout |
| R19 | Suite brand-*.test.ts | 6 archivos `tests/brand-*.test.ts` verdes |
| R20 | E2E branding rutas clave | `e2e/branding.spec.ts` (5 tests verdes) |

## Verificación ejecutada

| Comando | Resultado |
|---------|-----------|
| `pnpm exec vitest run tests/brand-*.test.ts tests/pwa-manifest.test.ts tests/backoffice-status-badge.test.ts` | ✅ 21 tests |
| `pnpm exec playwright test e2e/branding.spec.ts` | ✅ 5 tests |
| `pnpm exec playwright test e2e/briefing.spec.ts` | ✅ (logo PNG assert) |
| `pnpm run check` | ⚠️ 4 errores TS preexistentes (#8 cierre/scoring/canonical), 0 nuevos de branding |
| `./init.sh` / `pnpm test` completo | ⚠️ ~40 tests rotos preexistentes (API closure, auth briefing-token duplicate key, session, canonical snapshot) — **no relacionados con #11** |

## Notas de diseño

- **Briefing layout:** superficie `bg-sys-offwhite` sin SysShell header (evita logo duplicado); logo centrado en `briefing-header.svelte`.
- **Cierre layout:** wrapper mínimo; SysShell light proviene de `(app)/+layout.svelte`.
- **Logos:** descargados desde CDN oficial (R2) a `static/brand/`; eliminado `sys-logo.svg`.
- **E2E helpers:** `loginAsAdmin` usa `getByLabel` (compatible con `SysInput`).

## Archivos principales creados

- `src/lib/brand/{tokens,badge-variants,index}.ts`
- `src/lib/components/brand/{SysShell,SysButton,SysInput,SysTextarea,SysBadge}.svelte`
- `tests/brand-{tokens,assets,typography,components,shell,pwa-meta}.test.ts`
- `e2e/branding.spec.ts`
- `static/brand/{sys-horizontal-w,sys-horizontal-b,isologo-og}.png`
