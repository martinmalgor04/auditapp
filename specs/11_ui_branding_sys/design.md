# Design — #11 11_ui_branding_sys

## Alcance

Capa visual unificada SyS en toda auditapp: tokens CSS/Tailwind oficiales, logos locales, Montserrat, shell común (`SysShell`) y componentes base (`SysButton`, `SysInput`, `SysBadge`). Migración de paleta legacy introducida en #5 briefing y usos parciales en #7 form.

| Incluido | Excluido |
|---|---|
| `brand.css` + `tailwind.config.js` oficiales | PDF/Loom informe (SPEC-08) |
| Logos en `static/brand/`, favicon, íconos PWA | Piezas marketing HTML/Remotion |
| Shell login, backoffice, form, cierre | Rediseño UX/flujos funcionales |
| Migración briefing + form a tokens | Keep Calm como fuente web |
| Manifest + meta `theme-color` | Partners/clients logo strip |
| Componentes base reutilizables | `@testing-library/svelte` (no está en stack) |

## Dependencias

| Feature | Contrato usado |
|---|---|
| `05_briefing_externo` (#5) | `brand.css` legacy, `briefing-header.svelte`, layout briefing |
| `07_form_tecnico` (#7) | Layout form, `section-nav`, fields con `--sys-primary` |
| `04_backoffice` (#4) | `(app)/+layout.svelte`, badges estado vía `status-colors.ts` |
| `08_cierre_scoring` (#8) | Ruta `(app)/auditorias/[id]/cierre/` — shell se aplica al implementar o al existir |
| `10_deploy_dokploy` (#10) | `tests/pwa-manifest.test.ts` expectations; prod sirve mismos estáticos |

**Orden recomendado:** implementar #11 después de #7 `done` y preferentemente después de #8 `done` (ruta cierre). Si #11 corre con #8 en `spec_ready`, el implementer crea `(app)/auditorias/[id]/cierre/+layout.svelte` mínimo con `SysShell` o deja hook documentado para #8.

## Fuentes de marca (obligatorio)

| Recurso | Path |
|---|---|
| Skill sys-brand | `MARKETING/AGENTS/sys-brand/SKILL.md` |
| Paleta oficial | `sys-brand/references/palette.md` |
| Assets/logos | `sys-brand/references/assets.md` |
| Web/forms | `sys-brand/references/formats-web.md` |
| Tipografía | `sys-brand/references/typography.md` |
| SPEC padre | `docs/source-specs/specs-07/spec.md` §6 |

**CDN referencia (copiar a repo, no hotlink en app):**

- `sys_horizontal_w.png` → `static/brand/sys-horizontal-w.png`
- `sys_horizontal_b.png` → `static/brand/sys-horizontal-b.png`
- `isologo_og.png` → `static/brand/isologo-og.png` (+ generar favicon/icons)

**Path local fuente:** `BROCHURE/assets/` (mismos nombres de archivo según `assets.md`).

## Estado actual (deuda visual)

| Archivo | Problema |
|---|---|
| `src/lib/styles/brand.css` | `--sys-primary: #1e4d8c` (no oficial) |
| `static/manifest.webmanifest` | `theme_color: #003366` |
| `src/app.html` | `theme-color: #003366` |
| `static/brand/sys-logo.svg` | Placeholder |
| `(app)/+layout.svelte` | Tailwind `slate-*` genérico, sin logo |
| `login/+page.svelte` | Tailwind genérico, botón `slate-900` |
| `briefing/[token]/+layout.svelte` | Único import de `brand.css` (duplicar → raíz) |
| Form fields | `border-slate-300`, `--sys-primary` en nav/botones |

## Mapa de migración tokens

| Legacy (eliminar) | Oficial (usar) | Uso típico |
|---|---|---|
| `--sys-primary` | `--sys-azul-electrico` | Botones primarios, progreso activo |
| `--sys-primary-dark` | `#1976D2` (hover CTA, constante en componente) | Hover botón |
| `--sys-accent` | `--sys-azul-electrico` | Indicador "Guardando…" |
| `--sys-surface` | `--sys-offwhite` | Fondo app claro |
| `--sys-text` | `--sys-text-on-light` | Títulos sobre claro |
| `--sys-text-muted` | `--sys-text-body-light` con opacidad o token dedicado `--sys-text-muted-light: #64748b` solo si hace falta contraste WCAG | Subcopy |
| `#003366` | `#0A1929` | PWA theme |

**Nota:** `--sys-radius` existente (`0.75rem`) se mantiene como `--sys-radius-app` para no romper touch targets del form; botones de marca usan `4px` según web guide (`--sys-radius-cta: 4px`).

## Arquitectura

```
src/lib/styles/brand.css          ← tokens :root oficiales
src/lib/brand/
  ├── tokens.ts                   ← constantes hex para tests (OFFICIAL_COLORS)
  ├── badge-variants.ts           ← mapa status → clases SysBadge (testeable)
  └── index.ts                    ← re-exports
src/lib/components/brand/
  ├── SysShell.svelte
  ├── SysButton.svelte
  ├── SysInput.svelte
  ├── SysTextarea.svelte          ← opcional, mismos estilos que Input
  └── SysBadge.svelte
src/routes/+layout.svelte         ← import brand.css + link Montserrat
static/brand/                     ← PNGs oficiales
static/icons/                     ← regenerados desde isologo
tailwind.config.js                ← theme.extend.sys.*
```

```
                    +layout.svelte (brand.css + Montserrat)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   login (dark)         (app) (light)        briefing (light)
   SysShell             SysShell              SysShell
        │                     │                     │
   SysButton            nav + SysBadge          SysButton
```

## Archivos a crear o modificar

### Tokens y config

| Archivo | Acción |
|---|---|
| `src/lib/styles/brand.css` | Reemplazar contenido con variables oficiales (skill § CSS Variables) |
| `tailwind.config.js` | `theme.extend.colors.sys`, `fontFamily.sys`, `borderRadius.sys` |
| `src/lib/brand/tokens.ts` | `OFFICIAL_COLORS`, `LEGACY_BANNED` para tests |
| `src/lib/brand/badge-variants.ts` | Variantes semáforo + estado auditoría |
| `src/lib/brand/index.ts` | Barrel export |

### Componentes marca

| Archivo | Props / comportamiento |
|---|---|
| `SysShell.svelte` | `variant: 'dark' \| 'light'`, `showTopBar?: boolean` (default true en dark), slot default children, slot opcional `header-actions` |
| `SysButton.svelte` | `variant: 'primary' \| 'secondary' \| 'ghost'`, `type`, `disabled`, `class` — primary usa `bg-sys-electrico` |
| `SysInput.svelte` | `label`, `name`, `type`, `error`, attrs estándar — focus ring eléctrico |
| `SysBadge.svelte` | `variant: 'green' \| 'red' \| 'amber' \| 'neutral' \| AuditStatusVariant` |

### Layouts y rutas

| Archivo | Cambio |
|---|---|
| `src/routes/+layout.svelte` | `@import brand.css`, Montserrat, `class="font-sys"` en wrapper |
| `src/routes/login/+page.svelte` | `SysShell variant="dark"`, `SysButton`, `SysInput` |
| `src/routes/(app)/+layout.svelte` | `SysShell variant="light"` con nav existente + logo |
| `src/routes/briefing/[token]/+layout.svelte` | Quitar import duplicado brand.css; usar `SysShell light` |
| `src/routes/(app)/auditorias/[id]/form/+layout.svelte` | Tokens unificados; opcional sub-header dentro de shell |
| `src/routes/(app)/auditorias/[id]/cierre/+layout.svelte` | Crear con `SysShell light` (si #8 ya tiene página) |

### Assets estáticos

| Archivo | Acción |
|---|---|
| `static/brand/sys-horizontal-w.png` | Copiar desde CDN/assets |
| `static/brand/sys-horizontal-b.png` | Copiar desde CDN/assets |
| `static/brand/isologo-og.png` | Copiar; base para favicon/icons |
| `static/brand/sys-logo.svg` | Eliminar o reemplazar por PNG oficial |
| `static/favicon.png` | Regenerar 32×32 desde isologo |
| `static/icons/icon-192.png`, `icon-512.png` | Regenerar desde isologo |
| `static/manifest.webmanifest` | `theme_color`, `background_color` → `#0A1929` |
| `src/app.html` | `theme-color` → `#0A1929` |

### Migración componentes existentes

| Archivo | Cambio |
|---|---|
| `src/lib/components/briefing/briefing-header.svelte` | Logo `/brand/sys-horizontal-b.png` |
| `src/lib/components/form/section-nav.svelte` | `--sys-azul-electrico` en activo |
| `src/lib/components/form/*-field.svelte` | `SysInput` o clases `border-sys-*` / focus eléctrico |
| `src/lib/server/backoffice/status-colors.ts` | Delegar a `badge-variants.ts` o alinear clases con SysBadge |
| `briefing/+page.svelte`, `form/+page.svelte` | `SysButton` primario |

### Tests

| Archivo | Cubre |
|---|---|
| `tests/brand-tokens.test.ts` | R1, R2, R3, R10, R12, R18 |
| `tests/brand-assets.test.ts` | R5, R6 |
| `tests/brand-typography.test.ts` | R4 |
| `tests/brand-components.test.ts` | R15, R16, R17 |
| `tests/brand-pwa-meta.test.ts` | R14 |
| `tests/brand-shell.test.ts` | R7, R11 |
| `tests/pwa-manifest.test.ts` | Actualizar expectativas R13 |
| `tests/backoffice-status-badge.test.ts` | Actualizar para R17 |
| `e2e/branding.spec.ts` | R8, R9, R10, R20 |
| `e2e/briefing.spec.ts` | Actualizar assert logo R12 |

## Firmas TypeScript

```typescript
// src/lib/brand/tokens.ts
export const OFFICIAL_COLORS = {
  azulProfundo: '#0A1929',
  azulMedio: '#102A43',
  azulElectrico: '#2196F3',
  celeste: '#A2C6D4',
  offwhite: '#F7F9FB',
  verde: '#27AE60',
  rojo: '#E63946',
  naranja: '#F39C12',
  grisNeutro: '#908A82'
} as const;

export const LEGACY_BANNED = [
  '#1e4d8c', '#163a6b', '#2b7de9', '#003366',
  '--sys-primary', '--sys-primary-dark', '--sys-accent'
] as const;
```

```typescript
// src/lib/brand/badge-variants.ts
export type SysBadgeVariant = 'green' | 'red' | 'amber' | 'neutral';

export function getSysBadgeClasses(variant: SysBadgeVariant): string;

export function getAuditStatusBadgeVariant(status: AuditStatus): SysBadgeVariant | string;
```

## SysShell — estructura visual

**Variante `dark` (login):**

- Fondo: `var(--sys-bg-gradient)`
- `::before` top bar 6px `#2196F3` (o elemento `div` con `h-[var(--sys-top-bar)]`)
- Logo centrado: `/brand/sys-horizontal-w.png`, alt "Servicios y Sistemas", `h-10`
- Contenido en card blanca centrada (`max-w-sm`, `rounded`, sombra sutil)

**Variante `light` (app autenticada, briefing):**

- Fondo: `bg-sys-offwhite`
- Header sticky blanco, borde inferior `rgba(0,0,0,0.06)`
- Logo: `/brand/sys-horizontal-b.png`, `h-8`
- Nav links: `text-sys-profundo`, hover `text-sys-electrico`

## Errores

Sin errores de dominio nuevos. Cambio puramente presentacional; tests existentes de API/DB no se alteran salvo expectations de clases en badge tests.

## Alternativas descartadas

| Alternativa | Motivo descarte |
|---|---|
| **Hotlink CDN R2 en `<img src>`** | PWA offline y SW precache requieren assets en `static/`; latencia y dependencia externa en campo. |
| **Mantener aliases `--sys-primary` → eléctrico** | Oculta deuda; el humano pidió paleta unificada sin legacy; grep en R2 prohíbe confusión. |
| **Tailwind `@theme` v4** | Proyecto usa Tailwind 3.4; migración fuera de alcance. |
| **shadcn-svelte / DaisyUI** | Dependencia nueva; sys-brand ya define componentes mínimos (botón, input, badge). |
| **Keep Calm via @font-face** | Prohibido fuera del logo; logo es imagen PNG. |
| **Un solo shell oscuro en toda la app** | Backoffice y form son lectura prolongada; off-white reduce fatiga (formats-web, palette proporción 20% blanco). |

## Compatibilidad con tests existentes

- `tests/pwa-manifest.test.ts` debe actualizar `theme_color` de `#003366` a `#0A1929` (parte de T12 en tasks).
- `e2e/briefing.spec.ts` puede seguir pasando; solo cambia selector de logo (path PNG).
- `pnpm test` count aumenta ~6 archivos brand; registrar en `tests/setup.ts` si aplica patrón de inclusión.

## Verificación reviewer

Trazabilidad en `progress/impl_11_ui_branding_sys.md`. `./init.sh` verde. Sin hex legacy en `src/` según R2.
