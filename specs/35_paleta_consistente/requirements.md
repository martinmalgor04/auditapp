# Requirements — 35_paleta_consistente

> El design system de auditapp define tokens `sys-*` para toda la paleta
> (profundo, medio, electrico, offwhite, etc.) pero varias páginas y componentes
> usan clases Tailwind del sistema base (`slate-*`, `gray-*`). Esto produce
> inconsistencias visuales perceptibles y rompe la coherencia de marca.
> Esta feature normaliza todo el código a los tokens oficiales.

## Contexto verificado

- **Páginas afectadas:** `/auditorias/new` y `/usuarios` usan extensamente
  `text-slate-900`, `text-slate-700`, `bg-slate-900`, `border-slate-300`, etc.
- **Field types:** `text-field.svelte`, `number-field.svelte` y otros en
  `src/lib/components/form/fields/` usan `text-slate-800` en labels en vez
  de la clase `.sys-field-label`.
- **Tokens disponibles:** `text-sys-profundo`, `text-sys-medio`, `text-sys-electrico`,
  `bg-sys-profundo`, `bg-sys-offwhite`, `border-[var(--sys-border-subtle)]`,
  clase `.sys-field-label` (definida en `app.css`).
- **Títulos de pestaña:** la mayoría de páginas tienen `<title>` genérico
  (`Tablero — auditapp`). Las páginas de auditoría deberían incluir el nombre
  del cliente para que sean identificables con múltiples pestañas abiertas.

## Requerimientos

### R1 — Paleta slate → sys en `/auditorias/new`

El sistema DEBE reemplazar todas las clases `slate-*` y `gray-*` en
`src/routes/(app)/auditorias/new/+page.svelte` por los equivalentes del
design system:

| Clase actual | Reemplazar por |
|---|---|
| `text-slate-900`, `text-slate-800` | `text-sys-profundo` |
| `text-slate-700`, `text-slate-600` | `text-sys-medio` |
| `text-slate-500`, `text-slate-400` | `text-[var(--sys-text-muted-light)]` |
| `bg-slate-900` | `bg-sys-profundo` |
| `bg-slate-50`, `bg-gray-50` | `bg-sys-offwhite` |
| `border-slate-300`, `border-gray-200` | `border-[var(--sys-border-subtle)]` |

### R2 — Paleta slate → sys en `/usuarios`

El sistema DEBE reemplazar las mismas clases `slate-*`/`gray-*` en
`src/routes/(app)/usuarios/+page.svelte` por los equivalentes del design system.

### R3 — Labels de field types

Los labels en los componentes de `src/lib/components/form/fields/` DEBEN usar
la clase `.sys-field-label` (o `text-sm font-medium text-[var(--sys-text-muted-light)]`)
en lugar de `text-slate-800`, `text-slate-700`, etc.

Aplica al menos a: `text-field.svelte`, `number-field.svelte`, y cualquier otro
field type que use `slate-*` en el label.

### R4 — Títulos de pestaña descriptivos en vistas de auditoría

CUANDO el usuario está en `/auditorias/[id]/form`, el `<title>` DEBE incluir
el nombre de la empresa: `{empresa} — Form | SyS Audit`.

CUANDO el usuario está en `/auditorias/[id]` (detalle), el `<title>` DEBE
incluir el nombre de la empresa: `{empresa} | SyS Audit`.

CUANDO el usuario está en `/auditorias/[id]/cierre`, el `<title>` DEBE incluir
el nombre de la empresa: `{empresa} — Cierre | SyS Audit`.

### R5 — Sin regresión de funcionalidad

El cambio es puramente visual/semántico. NINGUNA funcionalidad, estructura HTML,
lógica de datos ni tests existentes DEBEN romperse por esta feature.

## Trazabilidad requerida

| R | Test mínimo |
|---|---|
| R1 | Grep de `slate-` en `auditorias/new/+page.svelte` → 0 coincidencias |
| R2 | Grep de `slate-` en `usuarios/+page.svelte` → 0 coincidencias |
| R3 | Grep de `slate-` en `form/fields/*.svelte` (labels) → 0 coincidencias en props de label |
| R4 | La página form con una auditoría de prueba devuelve `<title>` que contiene el nombre de la empresa |
| R5 | `pnpm run check` pasa sin errores nuevos |
