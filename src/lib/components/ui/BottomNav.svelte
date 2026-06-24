<script lang="ts">
  import { page } from '$app/stores';

  export let user: { role: 'admin' | 'tecnico' } = { role: 'admin' };

  const isAdmin = user.role === 'admin';

  const items = [
    { label: 'Tablero', href: '/tablero', icon: '📋', adminOnly: false },
    { label: 'CRM', href: '/crm', icon: '👥', adminOnly: false },
    { label: '', href: '/auditorias/new', icon: '＋', isFab: true, adminOnly: false },
    { label: 'Mercado', href: '/mercado', icon: '📊', adminOnly: true },
    { label: 'Usuarios', href: '/usuarios', icon: '👤', adminOnly: true },
    { label: 'Plantillas', href: '/plantillas', icon: '📝', adminOnly: false }
  ];

  function isActive(href: string) {
    return $page.url.pathname === href || $page.url.pathname.startsWith(`${href}/`);
  }
</script>

<nav
  class="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[--sys-navy] flex items-center justify-around pb-[env(safe-area-inset-bottom)]"
  aria-label="Navegación principal"
>
  {#each items as item}
    {#if !item.adminOnly || isAdmin}
      {#if item.isFab}
        <a
          href={item.href}
          class="w-[34px] h-[34px] rounded-full bg-[--sys-primary] flex items-center justify-center text-white text-xl shadow-lg"
          style="margin-bottom: -2px"
          aria-label="Nueva auditoría"
        >
          {item.icon}
        </a>
      {:else}
        <a
          href={item.href}
          class="flex flex-col items-center gap-0.5 text-xs
            {isActive(item.href) ? 'text-[--sys-primary]' : 'text-white/35'}"
          aria-current={isActive(item.href) ? 'page' : undefined}
        >
          <span class="text-base">{item.icon}</span>
          <span>{item.label}</span>
        </a>
      {/if}
    {/if}
  {/each}
</nav>
