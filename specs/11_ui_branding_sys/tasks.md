# Tasks — #11 11_ui_branding_sys

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en `progress/impl_11_ui_branding_sys.md`.

> **Prerrequisitos:** #7 `07_form_tecnico` en `done`. Ideal: #8 `08_cierre_scoring` en `done` antes de T15 (shell cierre). #5 briefing y #4 backoffice en `done`.

## Tokens y configuración

- [x] T1 — Reemplazar `src/lib/styles/brand.css` con variables oficiales SyS (`palette.md` + skill CSS Variables). Cubre: **R1**.
- [x] T2 — Crear `src/lib/brand/tokens.ts` con `OFFICIAL_COLORS` y `LEGACY_BANNED`. Cubre: **R1, R2**.
- [x] T3 — Extender `tailwind.config.js` (`colors.sys`, `fontFamily.sys`, `borderRadius`). Cubre: **R3**.
- [x] T4 — Importar `brand.css` solo en `src/routes/+layout.svelte`; quitar imports duplicados en briefing/form. Cubre: **R18**.

## Tipografía

- [x] T5 — Añadir link Google Fonts Montserrat (300–800) en layout raíz y `font-sys` en `body` vía `app.css`. Cubre: **R4**.
- [x] T6 — Crear `tests/brand-typography.test.ts`. Cubre: **R4**.

## Assets de marca

- [x] T7 — Copiar desde `BROCHURE/assets/` o CDN a `static/brand/`: `sys-horizontal-w.png`, `sys-horizontal-b.png`, `isologo-og.png`. Eliminar `sys-logo.svg` placeholder. Cubre: **R5**.
- [x] T8 — Regenerar `static/favicon.png`, `static/icons/icon-192.png`, `static/icons/icon-512.png` desde isologo oficial. Cubre: **R6**.
- [x] T9 — Crear `tests/brand-assets.test.ts` (existencia, tamaño mínimo, rutas manifest). Cubre: **R5, R6**.

## Componentes base

- [x] T10 — Implementar `src/lib/components/brand/SysShell.svelte` (variantes `dark` / `light`). Cubre: **R7**.
- [x] T11 — Implementar `SysButton.svelte`, `SysInput.svelte`, `SysTextarea.svelte`. Cubre: **R15, R16**.
- [x] T12 — Crear `src/lib/brand/badge-variants.ts` e implementar `SysBadge.svelte`. Cubre: **R17**.
- [x] T13 — Crear `tests/brand-components.test.ts` y `tests/brand-shell.test.ts`. Cubre: **R7, R15, R16, R17**.

## Shell por ruta

- [x] T14 — Refactor `src/routes/login/+page.svelte` con `SysShell dark` + componentes marca. Cubre: **R8**.
- [x] T15 — Refactor `src/routes/(app)/+layout.svelte` con `SysShell light`, logo y nav SyS. Cubre: **R9**.
- [x] T16 — Ajustar `src/routes/(app)/auditorias/[id]/form/+layout.svelte` y `section-nav` / botones a tokens unificados. Cubre: **R10**.
- [x] T17 — Crear o actualizar `(app)/auditorias/[id]/cierre/+layout.svelte` con `SysShell light` (si ruta #8 existe). Cubre: **R11**.

## Briefing y backoffice

- [x] T18 — Migrar `briefing-header.svelte`, `briefing/+layout.svelte` y CTAs a tokens oficiales + logo PNG. Cubre: **R12**.
- [x] T19 — Migrar `status-colors.ts` / badges backoffice a `SysBadge` / `badge-variants.ts`. Actualizar `tests/backoffice-status-badge.test.ts`. Cubre: **R17**.

## PWA y meta

- [x] T20 — Actualizar `static/manifest.webmanifest` (`theme_color`, `background_color` → `#0A1929`). Cubre: **R13**.
- [x] T21 — Actualizar `src/app.html` meta `theme-color`. Cubre: **R14**.
- [x] T22 — Actualizar `tests/pwa-manifest.test.ts` y crear `tests/brand-pwa-meta.test.ts`. Cubre: **R13, R14**.

## Migración legacy en src/

- [x] T23 — Reemplazar en `src/` todas las referencias `--sys-primary`, `--sys-accent`, `slate-*` en controles de marca por tokens/clases `sys-*`. Cubre: **R2, R10, R12**.
- [x] T24 — Crear `tests/brand-tokens.test.ts` (variables, tailwind, grep legacy). Cubre: **R1, R2, R3, R10, R12, R18, R19**.

## E2E

- [x] T25 — Crear `e2e/branding.spec.ts` (login, tablero autenticado, briefing logo). Cubre: **R8, R9, R20**.
- [x] T26 — Actualizar `e2e/briefing.spec.ts` assert logo oficial. Cubre: **R12, R20**.

## Cierre

- [x] T27 — Documentar trazabilidad R→test en `progress/impl_11_ui_branding_sys.md`. Cubre: todos.
- [x] T28 — Ejecutar `./init.sh`, `pnpm run check`, `pnpm test`, `pnpm exec playwright test e2e/branding.spec.ts`. Cubre: **R19, R20**.
