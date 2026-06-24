<script lang="ts">
  import { page } from '$app/state';
  import { isNavItemActive } from '$lib/nav/active-route';

  let { user }: { user: { name: string; role: 'admin' | 'tecnico' } } = $props();

  const isAdmin = $derived(user.role === 'admin');
  const pathname = $derived(page.url.pathname);

  const navItems = [
    { label: 'Tablero', href: '/tablero', icon: '📋', adminOnly: false },
    { label: 'CRM', href: '/crm', icon: '👥', adminOnly: false },
    { label: 'Mercado', href: '/mercado', icon: '📊', adminOnly: true },
    { label: 'Usuarios', href: '/usuarios', icon: '👤', adminOnly: true },
    { label: 'Plantillas', href: '/plantillas', icon: '📝', adminOnly: false }
  ];
</script>

<aside class="hidden lg:flex flex-col fixed left-0 top-0 h-full w-[220px] bg-sys-navy z-40">
  <div class="px-4 py-5 border-b border-white/10" data-sys-shell-header>
    <img src="/brand/sys-horizontal-w.png" alt="Servicios & Sistemas" class="h-6 mb-1" />
    <p class="text-sys-text-navy-muted text-xs">servicios & sistemas</p>
  </div>

  <nav class="flex-1 py-4 px-2 space-y-1">
    {#each navItems as item}
      {#if !item.adminOnly || isAdmin}
        {@const active = isNavItemActive(pathname, item.href)}
        <a
          href={item.href}
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
            {active ? 'bg-sys-primary text-white' : 'text-sys-text-navy-muted hover:bg-white/5'}"
          aria-current={active ? 'page' : undefined}
        >
          <span>{item.icon}</span>{item.label}
        </a>
      {/if}
    {/each}
  </nav>

  <div class="border-t border-white/10 px-4 py-3">
    <div class="flex items-center gap-2">
      <div
        class="w-8 h-8 rounded-full bg-sys-primary flex items-center justify-center text-white text-sm font-bold"
      >
        {user.name.charAt(0).toUpperCase()}
      </div>
      <div>
        <p class="text-white text-xs font-medium">{user.name}</p>
        <p class="text-sys-text-navy-muted text-xs">{user.role}</p>
      </div>
    </div>
  </div>
</aside>
