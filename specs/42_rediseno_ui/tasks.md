# Tasks — #42 42_rediseno_ui

> Pasos discretos en orden. El implementer ejecuta uno a la vez y marca `[x]` al completar.
> Cada paso referencia los requirements que cubre.

---

## Fase 1 — Design tokens

- [x] T1 — Actualizar `src/lib/styles/brand.css`: añadir `--sys-font-base: 'Montserrat', sans-serif`
  y el link a Google Fonts en el `<head>` del layout (o vía `@import` en CSS); añadir/actualizar
  las 15 variables de paleta listadas en R2. Verificar que no se eliminan variables `--sys-*`
  usadas por features anteriores. Cubre: **R1, R2**.

- [x] T2 — Actualizar `tailwind.config`: extender `theme.extend.colors` con claves que apuntan a
  las variables CSS de R2 (ej. `'sys-primary': 'var(--sys-primary)'`) y `fontFamily` con
  `'sys-base': 'var(--sys-font-base)'`; asegurarse de que las claves `sys-*` anteriores siguen
  presentes. Cubre: **R3**.

- [x] T3 — Crear `tests/ui/tokens.test.ts`: leer el contenido raw de `brand.css` y `tailwind.config`
  y verificar la presencia de cada variable y clave definida en R2/R3. `pnpm test` pasa. Cubre: **R1, R2, R3**.

---

## Fase 2 — Componentes compartidos

- [x] T4 — Crear `src/lib/components/ui/ChipPill.svelte` con las props de design.md §Firmas.
  Estilos Tailwind: activo=`bg-[--sys-primary] text-white`, inactivo=`bg-[--sys-bg-app] border border-[--sys-border]`,
  ambos `rounded-full px-3 py-1 text-sm font-medium`. Crear `tests/ui/chip-pill.test.ts`. Cubre: **R23**.

- [x] T5 — Crear `src/lib/components/ui/ChipFilters.svelte` que compone una fila de `ChipPill`.
  Cubre: **R9, R21**.

- [x] T6 — Crear `src/lib/components/ui/StatusBadge.svelte` con las props de design.md §Firmas.
  Mapa de colores según R13. Crear `tests/ui/status-badge.test.ts`. Cubre: **R13**.

- [x] T7 — Crear `src/lib/components/ui/ItemProgressBar.svelte` con las props de design.md §Firmas.
  Altura 5px, `rounded-full`, color por estado (cerrada=verde, en_cierre=ámbar, otros=azul).
  Crear `tests/ui/progress-bar.test.ts`. Cubre: **R22**.

---

## Fase 3 — Layout shell

- [x] T8 — Crear `src/lib/components/ui/ProgressBar.svelte`: reacciona a `$navigating` de SvelteKit.
  Fixed top-0, `h-[6px]`, `bg-[--sys-primary]`, `z-50`. Transición CSS de opacidad al desaparecer.
  Crear `tests/ui/layout.test.ts`. Cubre: **R4**.

- [x] T9 — Crear `src/lib/components/ui/HeaderMobile.svelte` con las props de design.md §Firmas.
  Gradiente `from-[--sys-navy] to-[--sys-navy-mid]`, avatar circular inicial del usuario, título
  24px/800/blanco, subtítulo en `--sys-text-navy-muted`, botón "+ Nueva" condicional `--sys-primary`.
  Clase contenedora `lg:hidden`. Crear `tests/ui/header-mobile.test.ts`. Cubre: **R5**.

- [x] T10 — Crear `src/lib/components/ui/Sidebar.svelte`: 220px, `bg-[--sys-navy]`, hidden en mobile,
  nav vertical con ítem activo `bg-[--sys-primary]`, avatar al pie con border-top.
  Usar `$page.url.pathname` para activo. Crear `tests/ui/sidebar.test.ts`. Cubre: **R6**.

- [x] T11 — Crear `src/lib/components/ui/BottomNav.svelte`: reemplaza el componente de `#36`.
  h-16, `bg-[--sys-navy]`, 6 ítems, FAB círculo 34px, `pb-[env(safe-area-inset-bottom)]`,
  `lg:hidden`. Crear `tests/ui/bottom-nav.test.ts`. Cubre: **R7**.

- [x] T12 — Modificar `src/routes/(app)/+layout.svelte`: componer HeaderMobile + Sidebar +
  ProgressBar + BottomNav. `<main>` con `lg:pl-[220px]` y `pb-20 lg:pb-0`. Eliminar o
  desactivar el header horizontal mobile legacy y el bottom nav de #36. Crear
  `e2e/ui-layout.spec.ts` con pruebas de viewport 390px y 1100px. Cubre: **R8, R24**.

- [x] T13 — Crear `e2e/ui-tokens.spec.ts`: navegar a la ruta `/` autenticada y verificar que
  `getComputedStyle(document.body).fontFamily` incluye `Montserrat`. Cubre: **R1**.

---

## Fase 4 — Tablero

- [x] T14 — Crear `src/lib/components/backoffice/AuditCard.svelte` con las props de design.md §Firmas.
  Integra `StatusBadge`, `ItemProgressBar`, chips de tipo, fila técnico+fecha, botones de acción.
  Crear `tests/ui/tablero.test.ts` (sección AuditCard). Cubre: **R10**.

- [x] T15 — Crear `src/lib/components/backoffice/TableroHeader.svelte` con las props de design.md §Firmas.
  Top bar blanco con título, subtítulo, botón "+ Nueva auditoría"; filter bar con `ChipFilters`,
  input de búsqueda con ícono lupa. Añadir tests en `tests/ui/tablero.test.ts`. Cubre: **R12**.

- [x] T16 — Modificar `src/routes/(app)/+page.svelte`: vista mobile usa lista de `AuditCard`;
  vista web (`lg:`) usa tabla con grid columns del design.md §Clases Tailwind. Integrar
  `TableroHeader`. Mantener inalteradas las actions y la carga de datos del `+page.server.ts`.
  Añadir tests en `tests/ui/tablero.test.ts` (sección tabla). Cubre: **R9, R11, R12, R25**.

- [x] T17 — Añadir `e2e/tablero.spec.ts` (o extender el existente): chip "IT" filtra; click en
  "Relevamiento" navega al form; a 390px existen cards; a 1100px existe tabla. Cubre: **R9, R10, R11**.

---

## Fase 5 — Relevamiento (form técnico)

- [x] T18 — Crear `src/lib/components/form/FormHeader.svelte` con las props de design.md §Firmas.
  Header navy, badge NN%·N pendientes, título sección, barra 4px. Clase `lg:hidden`.
  Crear `tests/ui/form-header.test.ts`. Cubre: **R14**.

- [x] T19 — Crear `src/lib/components/form/SectionChips.svelte`: scroll horizontal, chip con código,
  checkmark en sección completa, emit `onSelect`. Crear `tests/ui/section-chips.test.ts`. Cubre: **R15**.

- [x] T20 — Crear `src/lib/components/form/QuestionCard.svelte` con las props de design.md §Firmas.
  Botones Sí/No/Parcial con estilos activo/inactivo según R16. Crear `tests/ui/question-card.test.ts`.
  Cubre: **R16**.

- [x] T21 — Modificar `src/lib/components/form/field-renderer.svelte` (o el dispatcher equivalente):
  para `field_type === 'bool'` y `field_type === 'tri'` delegar a `QuestionCard`; resto sin cambio.
  Cubre: **R16, R25**.

- [x] T22 — Crear `src/lib/components/form/FormNextButton.svelte`: sticky bottom, fondo `--sys-navy`,
  visible solo si `pendingCount > 0`. Crear `tests/ui/form-next.test.ts`. Cubre: **R17**.

- [x] T23 — Modificar `src/routes/(app)/auditorias/[id]/form/+page.svelte`: integrar FormHeader,
  SectionChips, FormNextButton. Verificar que autosave, fotos y score en vivo no regresan.
  Cubre: **R14, R15, R17, R25**.

- [x] T24 — Añadir `e2e/form.spec.ts` (o extender el existente): tap chip navega; "Sí" persiste;
  responder todos oculta FormNextButton. Cubre: **R15, R16, R17**.

---

## Fase 6 — Mercado

- [x] T25 — Crear `src/lib/components/mercado/StatCard.svelte` con las props de design.md §Firmas.
  Border-top 3px por categoría, número 30px/800. Crear `tests/ui/mercado.test.ts` (sección StatCard).
  Cubre: **R18**.

- [x] T26 — Crear `src/lib/components/mercado/ErpDistribution.svelte`: barras 6px, label + %.
  Empty state cuando `data` es vacío. Añadir tests en `tests/ui/mercado.test.ts`. Cubre: **R19**.

- [x] T27 — Crear `src/lib/components/mercado/SectionScoreBar.svelte`: barra ancho proporcional
  al score, label a izquierda, % a derecha. Añadir tests en `tests/ui/mercado.test.ts`. Cubre: **R20**.

- [x] T28 — Modificar `src/routes/(app)/mercado/+page.svelte`: integrar StatCard (grid 2×2),
  ErpDistribution, SectionScoreBar y ChipFilters. Sin cambios en `+page.server.ts`.
  Añadir `e2e/mercado.spec.ts` (o extender el existente): chip "Seg. A" filtra. Cubre: **R18, R19, R20, R21, R25**.

---

## Fase 7 — Verificación final

- [x] T29 — Ejecutar `pnpm run check` y resolver todos los errores TypeScript introducidos por
  la feature. Cubre: **R3, R24**.

- [x] T30 — Ejecutar `pnpm test` (vitest) y verificar que TODA la suite pasa (tests pre-existentes
  + nuevos). Cubre: **R25**.

- [x] T31 — Ejecutar `pnpm exec playwright test` y verificar que todos los specs e2e pasan en los
  dos viewports (390px y 1100px). Cubre: **R24, R25**.

- [x] T32 — Eliminar el componente bottom nav legacy de `#36` si fue reemplazado completamente
  por `BottomNav.svelte` de esta feature, actualizando cualquier import remanente. Cubre: **R7**.
