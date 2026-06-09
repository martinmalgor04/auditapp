<script lang="ts">
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  const isAdmin = $derived(data.user?.role === 'admin');
</script>

<div class="min-h-screen bg-slate-50">
  <header class="bg-white border-b border-slate-200">
    <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
      <nav class="flex items-center gap-4 text-sm font-medium">
        <a href="/tablero" class="text-slate-900 hover:text-slate-600">Tablero</a>
        <a href="/auditorias/new" class="text-slate-700 hover:text-slate-900">Nueva auditoría</a>
        {#if isAdmin}
          <a href="/usuarios" class="text-slate-700 hover:text-slate-900">Usuarios</a>
          <a href="/plantillas" class="text-slate-700 hover:text-slate-900">Plantillas</a>
        {/if}
      </nav>
      <div class="flex items-center gap-3 text-sm text-slate-600">
        <span>{data.user?.name} ({data.user?.role})</span>
        <form method="POST" action="/logout">
          <button type="submit" class="text-slate-500 hover:text-slate-800 underline">Salir</button>
        </form>
      </div>
    </div>
  </header>
  <main class="max-w-7xl mx-auto px-4 py-6">
    {@render children?.()}
  </main>
</div>
