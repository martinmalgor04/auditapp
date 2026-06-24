<script lang="ts">
  import { page } from '$app/state';
  import { isNavItemActive } from '$lib/nav/active-route';

  let { user = { role: 'admin' as const } }: { user?: { role: 'admin' | 'tecnico' } } = $props();

  const isAdmin = $derived(user.role === 'admin');
  const pathname = $derived(page.url.pathname);

  const items = [
    { label: 'Tablero', href: '/tablero', icon: '📋', adminOnly: false },
    { label: 'CRM', href: '/crm', icon: '👥', adminOnly: false },
    { label: 'Mercado', href: '/mercado', icon: '📊', adminOnly: true },
    { label: 'Usuarios', href: '/usuarios', icon: '👤', adminOnly: true },
    { label: 'Plantillas', href: '/plantillas', icon: '📝', adminOnly: false }
  ];
</script>

<nav
  class="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-sys-navy"
  style="padding-bottom: env(safe-area-inset-bottom, 0px)"
  aria-label="Navegación principal"
>
  <div class="flex h-16 items-center justify-around">
    {#each items as item}
      {#if !item.adminOnly || isAdmin}
        {@const active = isNavItemActive(pathname, item.href)}
        <a
          href={item.href}
          class="flex flex-col items-center gap-0.5 text-xs min-w-[3rem]
            {active ? 'text-sys-primary' : 'text-white/35'}"
          aria-current={active ? 'page' : undefined}
        >
          <span class="text-base">{item.icon}</span>
          <span>{item.label}</span>
        </a>
      {/if}
    {/each}
  </div>
</nav>
