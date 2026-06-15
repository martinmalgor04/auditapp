<script lang="ts">
  import type { PageData } from './$types';
  import ClientPicker from '$lib/components/backoffice/client-picker.svelte';
  import CabSectionForm from '$lib/components/backoffice/cab-section-form.svelte';
  import AuditTypeCheckboxes from '$lib/components/backoffice/audit-type-checkboxes.svelte';
  import { AUDIT_TYPE_LABELS, type AuditType } from '$lib/audit-types';
  import {
    applyCabDefaultsToItems,
    clientToCabValues,
    newClientToCabFields,
    type ClientCabFields
  } from '$lib/backoffice/cab-client-map';

  let { data, form }: { data: PageData; form?: { error?: string } } = $props();

  type CabItem = PageData['cabItems'][number] & { value?: unknown };

  let cabItems = $state<CabItem[]>(data.cabItems.map((item) => ({ ...item })));
  let scheduledAt = $state('');

  const selectableTypes = $derived(
    data.allowedTypes ?? (Object.keys(AUDIT_TYPE_LABELS) as AuditType[])
  );
  const defaultSelectedTypes = $derived(
    data.defaultTypes.filter((type): type is AuditType =>
      selectableTypes.includes(type as AuditType)
    )
  );

  function prefillCabFromClient(_clientId: string, client: ClientCabFields) {
    cabItems = applyCabDefaultsToItems(cabItems, client, scheduledAt || null);
  }

  function prefillCabFromNewClient(fields: { razonSocial: string; cuit: string; rubro: string }) {
    if (!fields.razonSocial.trim()) return;
    cabItems = applyCabDefaultsToItems(
      cabItems,
      newClientToCabFields(fields),
      scheduledAt || null
    );
  }

  function syncScheduledAtToCab() {
    if (!scheduledAt) return;
    const defaults = clientToCabValues(
      {
        razonSocial: '',
        cuit: null,
        rubro: null,
        empleados: null,
        referenteNombre: null,
        referenteContacto: null,
        erpActual: null,
        proveedorCorreo: null,
        soporteItActual: null,
        direccion: null,
        telefono: null,
        email: null
      },
      cabItems,
      scheduledAt
    );

    cabItems = cabItems.map((item) => {
      const next = defaults[item.id];
      return next !== undefined ? { ...item, value: next } : item;
    });
  }
</script>

<svelte:head>
  <title>Nueva auditoría — auditapp</title>
</svelte:head>

<h1 class="text-2xl font-bold text-slate-900 mb-6">Nueva auditoría</h1>

{#if form?.error}
  <p class="mb-4 text-sm text-red-600" role="alert">{form.error}</p>
{/if}

<form method="POST" action="?/create" class="space-y-6 max-w-2xl">
  <ClientPicker
    onClientSelect={prefillCabFromClient}
    onNewClientChange={prefillCabFromNewClient}
  />

  <fieldset class="space-y-2">
    <legend class="text-sm font-semibold text-slate-800">Tipos</legend>
    {#each selectableTypes as type}
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="types"
          value={type}
          checked={defaultSelectedTypes.includes(type)}
        />
        {AUDIT_TYPE_LABELS[type]}
      </label>
    {/each}
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
      bind:value={scheduledAt}
      onchange={syncScheduledAtToCab}
      required
      class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
    />
  </label>

  <CabSectionForm items={cabItems} />

  <button
    type="submit"
    class="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
  >
    Crear auditoría
  </button>
</form>
