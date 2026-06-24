<script lang="ts">
  import { page } from '$app/stores';

  export let user: { role: 'admin' | 'tecnico' } = { role: 'admin' };

  const isAdmin = user.role === 'admin';

  const items = [
    { label: 'Tablero', href: '/tablero', icon: '📋', adminOnly: false },
    { label: 'CRM', href: '/crm', icon: '👥', adminOnly: false },
    { label: 'Mercado', href: '/mercado', icon: '📊', adminOnly: true },
    { label: 'Usuarios', href: '/usuarios', icon: '👤', adminOnly: true },
    { label: 'Plantillas', href: '/plantillas', icon: '📝', adminOnly: false }
  ];

  $: pathname = $page.url.pathname;

  function isActive(href: string) {
    if (href === '/tablero') {
      return pathname === '/' || pathname === '/tablero' || pathname.startsWith('/tablero/');
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }
</script>

<nav
  class="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-sys-navy"
  style="padding-bottom: env(safe-area-inset-bottom, 0px)"
  aria-label="Navegación principal"
>
  <div class="flex h-16 items-center justify-around">
    {#each items as item}
      {#if !item.adminOnly || isAdmin}
        <a
          href={item.href}
          class="flex flex-col items-center gap-0.5 text-xs min-w-[3rem]
            {isActive(item.href) ? 'text-sys-primary' : 'text-white/35'}"
          aria-current={isActive(item.href) ? 'page' : undefined}
        >
          <span class="text-base">{item.icon}</span>
          <span>{item.label}</span>
        </a>
      {/if}
    {/each}
  </div>
</nav>
