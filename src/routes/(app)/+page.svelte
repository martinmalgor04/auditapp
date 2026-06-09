<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>auditapp</title>
</svelte:head>

<main class="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-4">
  <h1 class="text-3xl font-bold text-slate-900 tracking-tight">auditapp</h1>
  {#if data.user}
    <p class="text-slate-600">Hola, {data.user.name} ({data.user.role})</p>
    <form method="POST" action="/logout">
      <button type="submit" class="text-sm text-slate-500 underline">Cerrar sesión</button>
    </form>
  {/if}
</main>
