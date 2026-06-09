<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Briefing — auditapp</title>
</svelte:head>

<main class="min-h-screen bg-slate-50 flex items-center justify-center p-6">
  {#if data.available}
    <div class="max-w-md text-center space-y-2">
      <h1 class="text-2xl font-bold text-slate-900">Briefing</h1>
      <p class="text-slate-600">Enlace válido. El formulario completo llegará en la feature #5.</p>
      <p class="text-xs text-slate-400">Estado: {data.audit.status}</p>
    </div>
  {:else}
    <div class="max-w-md text-center space-y-2">
      <h1 class="text-xl font-semibold text-slate-800">{data.message}</h1>
      <p class="text-slate-500 text-sm">
        Si necesitás completar el briefing, pedile a tu contacto en Servicios y Sistemas un nuevo enlace.
      </p>
    </div>
  {/if}
</main>
