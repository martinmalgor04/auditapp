<script lang="ts">
  import SysShell from '$lib/components/brand/SysShell.svelte';
  import InstallPWA from '$lib/components/brand/InstallPWA.svelte';
  import { AUDIT_TYPE_LABELS } from '$lib/audit-types';
  import { page } from '$app/stores';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  const isAdmin = $derived(data.user?.role === 'admin');

  function navClass(href: string) {
    const active = $page.url.pathname === href || $page.url.pathname.startsWith(href + '/');
    return `rounded-sys px-3 py-2 transition-colors hover:bg-sys-offwhite hover:text-sys-electrico ${
      active
        ? 'bg-sys-offwhite text-sys-electrico font-semibold'
        : 'text-sys-medio'
    }`;
  }
</script>

<SysShell variant="light">
  {#snippet nav()}
    <nav class="flex flex-col gap-0.5 text-sm font-medium md:flex-row md:items-center md:gap-1 md:whitespace-nowrap">
      <a href="/tablero" class={navClass('/tablero')}>Tablero</a>
      <a href="/crm" class={navClass('/crm')}>CRM</a>
      <a href="/auditorias/new" class={navClass('/auditorias/new')}>Nueva auditoría</a>
      {#if isAdmin}
        <a href="/mercado" class={navClass('/mercado')}>Mercado</a>
        <a href="/usuarios" class={navClass('/usuarios')}>Usuarios</a>
        <a href="/plantillas" class={navClass('/plantillas')}>Plantillas</a>
      {/if}
    </nav>
  {/snippet}

  {#snippet headerActions()}
    <div class="flex shrink-0 items-center gap-2 text-sm text-[var(--sys-text-muted-light)] sm:gap-3">
      <span class="hidden max-w-[10rem] truncate sm:inline sm:max-w-none">
        {data.user?.name} ({data.user?.role})
        {#if data.user?.role === 'tecnico' && data.user.auditTypes && data.user.auditTypes.length > 0}
          · {data.user.auditTypes.map((t) => AUDIT_TYPE_LABELS[t]).join(', ')}
        {/if}
      </span>
      <form method="POST" action="/logout">
        <button
          type="submit"
          class="rounded-sys px-2 py-1 text-sys-medio transition-colors hover:bg-sys-offwhite hover:text-sys-electrico"
        >
          Salir
        </button>
      </form>
    </div>
  {/snippet}

  {@render children?.()}
</SysShell>

<InstallPWA />
