<script lang="ts">
  import SysShell from '$lib/components/brand/SysShell.svelte';
  import { AUDIT_TYPE_LABELS } from '$lib/audit-types';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  const isAdmin = $derived(data.user?.role === 'admin');
</script>

<SysShell variant="light">
  {#snippet nav()}
    <nav class="flex items-center gap-1 whitespace-nowrap text-sm font-medium">
      <a
        href="/tablero"
        class="rounded-sys px-3 py-2 text-sys-profundo transition-colors hover:bg-sys-offwhite hover:text-sys-electrico"
      >
        Tablero
      </a>
      <a
        href="/auditorias/new"
        class="rounded-sys px-3 py-2 text-sys-medio transition-colors hover:bg-sys-offwhite hover:text-sys-electrico"
      >
        Nueva auditoría
      </a>
      {#if isAdmin}
        <a
          href="/usuarios"
          class="rounded-sys px-3 py-2 text-sys-medio transition-colors hover:bg-sys-offwhite hover:text-sys-electrico"
        >
          Usuarios
        </a>
        <a
          href="/plantillas"
          class="rounded-sys px-3 py-2 text-sys-medio transition-colors hover:bg-sys-offwhite hover:text-sys-electrico"
        >
          Plantillas
        </a>
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
