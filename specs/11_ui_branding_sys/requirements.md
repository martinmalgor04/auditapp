# Requirements — #11 11_ui_branding_sys

> Design system global SyS: tokens oficiales, logos, Montserrat, shell común y componentes base en toda auditapp.
> Fuente: `docs/source-specs/specs-07/spec.md` §6 (skill `sys-brand`), `palette.md` abril 2026.
> Depende de: `07_form_tecnico` (#7) `done`; idealmente `08_cierre_scoring` (#8) `done` (ruta cierre); verificación PWA prod opcional tras `10_deploy_dokploy` (#10).

## R1 — Variables CSS oficiales

El sistema DEBE declarar en `src/lib/styles/brand.css` las variables CSS oficiales SyS de `palette.md` (abril 2026), incluyendo como mínimo `--sys-azul-profundo`, `--sys-azul-medio`, `--sys-blanco`, `--sys-offwhite`, `--sys-celeste`, `--sys-azul-electrico`, tokens de texto sobre oscuro/claro, semáforo (`--sys-verde`, `--sys-rojo`, `--sys-naranja`, `--sys-gris-neutro`), `--sys-font`, `--sys-bg-gradient`, `--sys-top-bar` (6px) y `--sys-touch-min` (44px).

**Verificación:** `tests/brand-tokens.test.ts > brand.css declares official SyS CSS variables with exact hex values`.

## R2 — Ausencia de tokens legacy

El sistema NO DEBE declarar en `src/lib/styles/brand.css` ni referenciar en `src/` los tokens o hex legacy de marca `#1e4d8c`, `#163a6b`, `#2b7de9`, `#003366`, `--sys-primary`, `--sys-primary-dark` ni `--sys-accent`.

**Verificación:** `tests/brand-tokens.test.ts > src contains no legacy brand hex or CSS var names`; grep en CI vía el mismo test.

## R3 — Tokens en Tailwind

El sistema DEBE extender `tailwind.config.js` con colores y fuentes SyS (`sys.profundo`, `sys.electrico`, `sys.celeste`, `sys.offwhite`, semáforo, `fontFamily.sys`) mapeados a las variables CSS de `brand.css`.

**Verificación:** `tests/brand-tokens.test.ts > tailwind theme extends sys colors referencing CSS variables`.

## R4 — Tipografía Montserrat global

El sistema DEBE cargar Montserrat (pesos 300, 400, 600, 700, 800) desde Google Fonts en el layout raíz y aplicar `font-family: var(--sys-font)` al `body` de toda la aplicación.

**Verificación:** `tests/brand-typography.test.ts > root layout loads Montserrat and sets sys font on body`; inspección de `src/routes/+layout.svelte` y `src/app.css`.

## R5 — Logos oficiales en static/brand/

El sistema DEBE incluir en `static/brand/` copias locales de los logos oficiales SyS (fuente: `BROCHURE/assets/` o CDN R2 según `assets.md`): horizontal fondo claro (`sys-horizontal-b.png`), horizontal fondo oscuro (`sys-horizontal-w.png`) e isotipo celeste (`isologo-og.png`), cada archivo con tamaño > 1 KB (no placeholder SVG).

**Verificación:** `tests/brand-assets.test.ts > official logo files exist in static/brand with minimum size`.

## R6 — Favicon e íconos PWA SyS

El sistema DEBE usar el isotipo oficial SyS derivado de `isologo-og.png` en `static/favicon.png` y en los íconos PWA `static/icons/icon-192.png` y `static/icons/icon-512.png` referenciados por el manifest.

**Verificación:** `tests/brand-assets.test.ts > PWA icons and favicon exist and are non-placeholder`; `tests/pwa-manifest.test.ts` (actualizado) valida rutas de íconos.

## R7 — Componente shell SysShell

El sistema DEBE proveer un componente reutilizable `SysShell` con variante `dark` (fondo gradiente azul profundo, logo horizontal blanco, borde superior 6px azul eléctrico) y variante `light` (fondo off-white, logo horizontal oscuro, header sticky con borde inferior sutil).

**Verificación:** `tests/brand-shell.test.ts > SysShell exports dark and light variants with required structural classes`.

## R8 — Shell en login

CUANDO un visitante abre `GET /login`, el sistema DEBE renderizar el formulario dentro de `SysShell` variante `dark` con logo SyS visible y botón de envío usando azul eléctrico `#2196F3`.

**Verificación:** `e2e/branding.spec.ts > login page shows SyS logo and electric blue submit button`.

## R9 — Shell en backoffice autenticado

CUANDO un usuario autenticado navega rutas bajo `(app)/`, el sistema DEBE mostrar header SyS con logo horizontal fondo claro, navegación con acento azul eléctrico en hover y superficie principal `--sys-offwhite`.

**Verificación:** `e2e/branding.spec.ts > tablero shows branded header with sys-horizontal-b logo`.

## R10 — Shell en form técnico

CUANDO un técnico abre `GET /auditorias/{id}/form`, el sistema DEBE aplicar tokens unificados en layout, navegación de secciones, botones primarios e indicador de guardado (sin clases Tailwind genéricas `slate-*` ni variables legacy en controles de marca).

**Verificación:** `e2e/branding.spec.ts > form page uses sys-electrico primary button`; `tests/brand-tokens.test.ts > form layout and section-nav reference unified sys tokens`.

## R11 — Shell en pantalla de cierre

CUANDO existe la ruta `/auditorias/{id}/cierre` (feature #8), el sistema DEBE envolver esa pantalla con el mismo `SysShell` variante `light` que el backoffice.

**Verificación:** `tests/brand-shell.test.ts > cierre layout imports SysShell when route file exists`; `e2e/branding.spec.ts > cierre page shows branded header` (skip si ruta aún no implementada — documentar en test).

## R12 — Briefing alineado a tokens unificados

El sistema DEBE migrar `/briefing/[token]` para usar exclusivamente tokens oficiales (`--sys-azul-electrico` en CTAs, `--sys-text-on-light` / `--sys-text-body-light` en copy, `--sys-offwhite` en superficie) y logo horizontal según contraste del fondo, eliminando `sys-logo.svg` placeholder y referencias legacy.

**Verificación:** `tests/brand-tokens.test.ts > briefing components use official tokens only`; `e2e/briefing.spec.ts > shows official logo asset path /brand/sys-horizontal-b.png`.

## R13 — PWA manifest coherente

El sistema DEBE setear en `static/manifest.webmanifest` los valores `theme_color: "#0A1929"` y `background_color: "#0A1929"` alineados con `--sys-azul-profundo`.

**Verificación:** `tests/pwa-manifest.test.ts > theme_color and background_color match official azul profundo`.

## R14 — Meta theme-color en HTML

El sistema DEBE declarar `<meta name="theme-color" content="#0A1929">` en `src/app.html` coherente con el manifest PWA.

**Verificación:** `tests/brand-pwa-meta.test.ts > app.html theme-color meta matches manifest theme_color`.

## R15 — Componente SysButton primario

El sistema DEBE proveer `SysButton` con variante `primary` que use fondo `--sys-azul-electrico`, texto blanco, hover `#1976D2`, `min-height: var(--sys-touch-min)` y `border-radius` acorde a `formats-web.md` (4px).

**Verificación:** `tests/brand-components.test.ts > SysButton primary variant classes use sys-azul-electrico token`.

## R16 — Componente SysInput

El sistema DEBE proveer `SysInput` (y `SysTextarea` opcional con mismos estilos) con borde focus azul eléctrico y `box-shadow` `rgba(33,150,243,0.15)` según `formats-web.md` §W.9.

**Verificación:** `tests/brand-components.test.ts > SysInput applies electric focus ring styles`.

## R17 — Componente SysBadge semáforo

El sistema DEBE proveer `SysBadge` con variantes `green`, `red`, `amber`, `neutral` mapeadas a tokens semáforo oficiales, usadas como flags (no áreas dominantes), y el backoffice DEBE usar `SysBadge` para badges de estado de auditoría.

**Verificación:** `tests/brand-components.test.ts > SysBadge variants map to semaphore tokens`; `tests/backoffice-status-badge.test.ts` (actualizado) importa variantes desde módulo de marca unificado.

## R18 — Import global de brand.css

El sistema DEBE importar `src/lib/styles/brand.css` una sola vez en el layout raíz (`src/routes/+layout.svelte`) para que todos los shells y rutas hereden tokens sin imports duplicados por ruta.

**Verificación:** `tests/brand-tokens.test.ts > brand.css imported only from root layout`.

## R19 — Tests vitest de marca

El sistema DEBE incluir suite `tests/brand-*.test.ts` que cubra tokens, assets, tipografía, componentes y meta PWA.

**Verificación:** `pnpm test` incluye `tests/brand-tokens.test.ts`, `tests/brand-assets.test.ts`, `tests/brand-typography.test.ts`, `tests/brand-components.test.ts`, `tests/brand-pwa-meta.test.ts`, `tests/brand-shell.test.ts` en verde.

## R20 — E2E branding en rutas clave

El sistema DEBE incluir `e2e/branding.spec.ts` que verifique presencia del logo SyS y color de acento en login, tablero (autenticado) y briefing público.

**Verificación:** `pnpm exec playwright test e2e/branding.spec.ts` pasa contra servidor de test con fixtures existentes.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #11) | Requirements |
|---|---|
| Tokens oficiales SyS en brand.css y tailwind.config | R1, R2, R3, R18 |
| Logos oficiales en static/brand/ | R5, R6 |
| Shell SyS en login, backoffice, form técnico y cierre | R7, R8, R9, R10, R11 |
| Briefing alineado con tokens unificados | R12 |
| PWA manifest y theme_color coherentes | R13, R14 |
| Componentes base: botón, inputs, badges | R15, R16, R17 |
| Tests de tokens, manifest y logo en rutas clave | R19, R20 |

## Fuera de alcance (v1)

- Informe branded PDF/Loom (pipeline SPEC-08 externo).
- Piezas marketing estáticas (Stories, carousels, Remotion).
- Rediseño funcional de pantallas (solo capa visual/marca).
- Tipografía Keep Calm fuera del logo (prohibida por sys-brand).
- CDN-only para logos en runtime (se copian a `static/brand/` para PWA offline).

## Prerrequisitos de implementación

| Feature | Estado mínimo | Motivo |
|---|---|---|
| `07_form_tecnico` (#7) | `done` | Form y PWA base existen; #11 unifica estilos sobre ellos |
| `05_briefing_externo` (#5) | `done` | Briefing con tokens legacy a migrar |
| `04_backoffice` (#4) | `done` | Shell backoffice |
| `08_cierre_scoring` (#8) | `done` (ideal) | R11 requiere ruta `/cierre`; si #11 corre antes, dejar layout preparado y test con `test.skip` hasta #8 |
| `10_deploy_dokploy` (#10) | `done` (opcional) | Verificación PWA en prod; tokens/manifest se corrigen en #11 |
