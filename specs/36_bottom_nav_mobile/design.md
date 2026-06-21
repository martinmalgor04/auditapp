# Design — 36_bottom_nav_mobile

## Decisiones de diseño

### 1. Componente separado `BottomNav.svelte`

Se crea `src/lib/components/brand/BottomNav.svelte` y se incluye en
`src/routes/(app)/+layout.svelte` junto a `InstallPWA`. Esto mantiene
`SysShell.svelte` sin cambios y evita pasar snippets de nav a un componente
que ya recibe `nav` y `headerActions`.

### 2. Items fijos para técnico; items admin condicionales

La bottom nav siempre muestra Tablero + CRM + Nueva auditoría.
Si `isAdmin`, agrega Mercado (el ítem más relevante del grupo admin).
Usuarios y Plantillas son poco usados en mobile y se omiten de la bottom nav
para no saturarla.

```
Técnico:  [ Tablero ] [ CRM ] [ + Nueva ]
Admin:    [ Tablero ] [ CRM ] [ + Nueva ] [ Mercado ]
```

Con 4 items el diseño sigue siendo cómodo en iPhone SE (320px) y iPhone 15 Pro
(430px).

### 3. Ocultar nav horizontal del header en mobile

En `SysShell.svelte`, el nav horizontal está en:
```svelte
<div class="-mx-4 mt-2 overflow-x-auto px-4 pb-0.5 md:hidden">
  {@render nav?.()}
</div>
```

Cambiar la clase contenedora a `hidden` (eliminarlo del DOM en mobile) cuando
exista el BottomNav. La forma más limpia es agregar una prop `hasBottomNav` al
`SysShell` o simplemente cambiar el div a `hidden` permanentemente y dejar que
el BottomNav sea el único nav en mobile. La segunda opción es más simple.

**Decisión:** eliminar el div de nav horizontal mobile de `SysShell.svelte`.
La bottom nav lo reemplaza completamente.

### 4. Safe area y padding del main

El `<main>` de `SysShell` necesita `padding-bottom` extra en mobile para que
el contenido no quede tapado por la bottom nav (height ≈ 56px + safe-area).

```svelte
<main class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-8">
```

### 5. Z-index

- Bottom nav: `z-40` (mismo nivel que el header)
- `InstallPWA`: `z-50` (ya lo tiene, aparece encima)

Cuando InstallPWA está visible, se ubica encima de la bottom nav. No colisionan
porque InstallPWA tiene su propio `padding-bottom: env(safe-area-inset-bottom)`
y aparece flotando como un card, no como una barra fija.

---

## Componente `BottomNav.svelte`

```svelte
<script lang="ts">
  import { page } from '$app/stores';

  export let isAdmin = false;

  function isActive(href: string) {
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
  }
</script>

<nav class="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-sys-blanco border-t border-[var(--sys-border-subtle)]"
     style="padding-bottom: env(safe-area-inset-bottom)"
     aria-label="Navegación principal">
  <div class="flex h-14 items-center justify-around px-2">
    <!-- Tablero -->
    <a href="/tablero" class="nav-item" class:active={isActive('/tablero')}>
      <svg><!-- ícono grilla --></svg>
      <span>Tablero</span>
    </a>
    <!-- CRM -->
    <a href="/crm" class="nav-item" class:active={isActive('/crm')}>
      <svg><!-- ícono empresa --></svg>
      <span>CRM</span>
    </a>
    <!-- Nueva auditoría -->
    <a href="/auditorias/new" class="nav-item" class:active={isActive('/auditorias/new')}>
      <svg><!-- ícono + --></svg>
      <span>Nueva</span>
    </a>
    {#if isAdmin}
      <a href="/mercado" class="nav-item" class:active={isActive('/mercado')}>
        <svg><!-- ícono gráfico --></svg>
        <span>Mercado</span>
      </a>
    {/if}
  </div>
</nav>
```

Estilos de `nav-item`:
```css
.nav-item {
  @apply flex flex-col items-center gap-0.5 px-3 py-1 text-xs font-medium
         text-sys-medio transition-colors hover:text-sys-electrico;
  min-width: 48px; /* touch target horizontal */
}
.nav-item.active {
  @apply text-sys-electrico;
}
```

El ícono SVG tiene 22×22px, suficiente para visibilidad sin tomar demasiado espacio.

---

## Archivos a modificar

- `src/lib/components/brand/SysShell.svelte` — eliminar div nav horizontal mobile; agregar `padding-bottom` al main.
- `src/lib/components/brand/BottomNav.svelte` — nuevo componente.
- `src/routes/(app)/+layout.svelte` — importar y renderizar `<BottomNav {isAdmin} />`.
