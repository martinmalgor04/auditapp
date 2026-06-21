# Tasks — 35_paleta_consistente

## T1 — Grep inicial
Ejecutar `grep -rn "slate-\|gray-" src/routes/\(app\)/auditorias/new/ src/routes/\(app\)/usuarios/ src/lib/components/form/fields/` para mapear todos los casos antes de editar.

## T2 — Paleta en `/auditorias/new`
Reemplazar todas las clases `slate-*`/`gray-*` en `src/routes/(app)/auditorias/new/+page.svelte` usando la tabla de equivalencias del design.md.

## T3 — Paleta en `/usuarios`
Reemplazar todas las clases `slate-*`/`gray-*` en `src/routes/(app)/usuarios/+page.svelte`.

## T4 — Labels en field types
Reemplazar `text-slate-*` en labels de `src/lib/components/form/fields/text-field.svelte`, `number-field.svelte`, y los demás fields donde aparezca (verificar con grep del T1).

## T5 — Títulos descriptivos
- Verificar el shape de `data` en cada ruta de auditoría (qué campo trae el nombre de la empresa).
- Actualizar `<svelte:head>` en: `auditorias/[id]/+page.svelte`, `auditorias/[id]/form/+page.svelte`, `auditorias/[id]/cierre/+page.svelte`.

## T6 — Verificación
- `pnpm run check` → 0 errores nuevos.
- Grep de validación: `grep -rn "slate-" src/routes/(app)/auditorias/new/ src/routes/(app)/usuarios/ src/lib/components/form/fields/` → 0 resultados.
- Revisar visualmente en dev: `/auditorias/new`, `/usuarios`, y un form de auditoría.
