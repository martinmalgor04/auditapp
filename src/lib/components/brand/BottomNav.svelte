<script lang="ts">
  import { page } from '$app/stores';

  let { data }: { data?: { user: { role: string } | null } } = $props();

  const isAdmin = $derived(data?.user?.role === 'admin');

  function isActive(href: string) {
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
  }

  function navItemClass(href: string) {
    const active = isActive(href);
    return `flex flex-col items-center justify-center gap-1 px-4 py-2 transition-colors ${
      active
        ? 'text-sys-electrico'
        : 'text-sys-medio hover:text-sys-electrico'
    }`;
  }
</script>

<!-- Bottom navigation - visible on mobile only -->
<nav
  class="fixed bottom-0 left-0 right-0 z-40 flex border-t border-[var(--sys-border-subtle)] bg-sys-blanco md:hidden"
  style="padding-bottom: env(safe-area-inset-bottom, 0px);"
  aria-label="Navegación principal"
>
  <a href="/tablero" class={navItemClass('/tablero')} aria-current={isActive('/tablero') ? 'page' : undefined}>
    <!-- Dashboard icon -->
    <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="7" height="7"></rect>
      <rect x="14" y="3" width="7" height="7"></rect>
      <rect x="14" y="14" width="7" height="7"></rect>
      <rect x="3" y="14" width="7" height="7"></rect>
    </svg>
    <span class="text-xs font-medium">Tablero</span>
  </a>

  <a href="/crm" class={navItemClass('/crm')} aria-current={isActive('/crm') ? 'page' : undefined}>
    <!-- CRM icon (people/contacts) -->
    <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
    <span class="text-xs font-medium">CRM</span>
  </a>

  <a href="/auditorias/new" class={navItemClass('/auditorias/new')} aria-current={isActive('/auditorias/new') ? 'page' : undefined}>
    <!-- New audit icon (plus circle) -->
    <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M12 8v8"></path>
      <path d="M8 12h8"></path>
    </svg>
    <span class="text-xs font-medium">Auditoría</span>
  </a>

  {#if isAdmin}
    <a href="/mercado" class={navItemClass('/mercado')} aria-current={isActive('/mercado') ? 'page' : undefined}>
      <!-- Market icon (trending up) -->
      <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 17"></polyline>
        <polyline points="17 6 23 6 23 12"></polyline>
      </svg>
      <span class="text-xs font-medium">Mercado</span>
    </a>

    <a href="/usuarios" class={navItemClass('/usuarios')} aria-current={isActive('/usuarios') ? 'page' : undefined}>
      <!-- Users icon -->
      <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      </svg>
      <span class="text-xs font-medium">Usuarios</span>
    </a>

    <a href="/plantillas" class={navItemClass('/plantillas')} aria-current={isActive('/plantillas') ? 'page' : undefined}>
      <!-- Templates icon (file/document) -->
      <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
        <polyline points="13 2 13 9 20 9"></polyline>
      </svg>
      <span class="text-xs font-medium">Plantillas</span>
    </a>
  {/if}
</nav>
