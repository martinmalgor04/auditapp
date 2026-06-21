# Tasks — 36_bottom_nav_mobile

## T1 — Crear `BottomNav.svelte`
Crear `src/lib/components/brand/BottomNav.svelte` con los 3 items base (Tablero,
CRM, Nueva) más Mercado condicional para admin. Íconos SVG inline. Estado activo
con `$page.url.pathname`. Safe-area en padding-bottom.

## T2 — Eliminar nav horizontal mobile de `SysShell`
En `src/lib/components/brand/SysShell.svelte`, remover el `<div class="-mx-4 mt-2 overflow-x-auto md:hidden">` que renderiza el nav horizontal mobile.

## T3 — Padding-bottom al main de SysShell
Agregar `pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-8` al `<main>` de
`SysShell` para que el contenido no quede tapado por la bottom nav.

## T4 — Registrar BottomNav en el layout
En `src/routes/(app)/+layout.svelte`, importar `BottomNav` y renderizarlo después
de `</SysShell>` (igual que `InstallPWA`), pasando `isAdmin`.

## T5 — Verificación visual
- Abrir en DevTools con viewport 375px (iPhone SE): ver bottom nav con 3 items.
- Cambiar a admin: ver 4 items.
- Navegar entre páginas: confirmar estado activo correcto.
- Verificar que el nav horizontal del header desapareció en mobile.
- Revisar que el contenido de la página no queda tapado.

## T6 — Typecheck y test
- `pnpm run check` → 0 errores nuevos.
- Test: BottomNav renderiza los items correctos según `isAdmin`.
