<script lang="ts">
  import type { PageData } from './$types';
  import ClientPicker from '$lib/components/backoffice/client-picker.svelte';
  import CabSectionForm from '$lib/components/backoffice/cab-section-form.svelte';

  let { data, form }: { data: PageData; form?: { error?: string } } = $props();
</script>

<svelte:head>
  <title>Nueva auditoría — auditapp</title>
</svelte:head>

<h1 class="text-2xl font-bold text-slate-900 mb-6">Nueva auditoría</h1>

{#if form?.error}
  <p class="mb-4 text-sm text-red-600" role="alert">{form.error}</p>
{/if}

<form method="POST" action="?/create" class="space-y-6 max-w-2xl">
  <ClientPicker clients={data.clients} />

  <fieldset class="space-y-2">
    <legend class="text-sm font-semibold text-slate-800">Tipos</legend>
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" name="types" value="it" checked /> IT
    </label>
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" name="types" value="erp-tango" /> ERP Tango
    </label>
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" name="types" value="erp-estandar" /> ERP Estándar
    </label>
  </fieldset>

  <label class="block space-y-1">
    <span class="text-sm font-medium text-slate-700">Segmento</span>
    <select name="segment" required class="w-full rounded border border-slate-300 px-3 py-2 text-sm">
      <option value="A">A</option>
      <option value="B">B</option>
      <option value="C">C</option>
    </select>
  </label>

  <label class="block space-y-1">
    <span class="text-sm font-medium text-slate-700">Técnico asignado</span>
    <select
      name="assignedTechId"
      required
      class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
    >
      {#each data.technicians as tech}
        <option value={tech.id}>{tech.name}</option>
      {/each}
    </select>
  </label>

  <label class="block space-y-1">
    <span class="text-sm font-medium text-slate-700">Fecha de visita</span>
    <input
      type="date"
      name="scheduledAt"
      required
      class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
    />
  </label>

  <CabSectionForm items={data.cabItems} />

  <button
    type="submit"
    class="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
  >
    Crear auditoría
  </button>
</form>
