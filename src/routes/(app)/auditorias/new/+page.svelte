<script lang="ts">
  import type { PageData } from './$types';
  import ClientPicker from '$lib/components/backoffice/client-picker.svelte';
  import CabSectionForm from '$lib/components/backoffice/cab-section-form.svelte';
  import AuditStatusBadge from '$lib/components/backoffice/audit-status-badge.svelte';
  import { AUDIT_TYPE_LABELS, type AuditType } from '$lib/audit-types';
  import type { AuditStatus } from '$lib/audit-status';
  import {
    applyCabDefaultsToItems,
    clientToCabValues,
    newClientToCabFields,
    type ClientCabFields
  } from '$lib/backoffice/cab-client-map';

  type FormState = {
    error?: string;
    duplicateWarning?: boolean;
    conflicts?: Array<{
      id: string;
      refCode: string;
      status: AuditStatus;
      encargada: string | null;
    }>;
  };

  let { data, form }: { data: PageData; form?: FormState } = $props();

  type CabItem = PageData['cabItems'][number] & { value?: unknown };

  let cabItems = $state<CabItem[]>(data.cabItems.map((item) => ({ ...item })));
  let scheduledAt = $state('');

  const selectableTypes = $derived(
    data.allowedTypes ?? (Object.keys(AUDIT_TYPE_LABELS) as AuditType[])
  );
  const defaultType = $derived(
    (data.defaultTypes.find((type): type is AuditType =>
      selectableTypes.includes(type as AuditType)
    ) ?? selectableTypes[0]) as AuditType
  );

  let selectedType = $state<AuditType>('it');
  $effect(() => {
    selectedType = defaultType;
  });

  function techniciansFor(type: AuditType) {
    return data.technicians.filter(
      (tech) => !tech.auditTypes || tech.auditTypes.length === 0 || tech.auditTypes.includes(type)
    );
  }

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

<h1 class="text-2xl font-bold text-sys-profundo mb-6">Nueva auditoría</h1>

{#if form?.error && !form.duplicateWarning}
  <p class="mb-4 text-sm text-red-600" role="alert">{form.error}</p>
{/if}

{#if form?.duplicateWarning && form.conflicts}
  <div
    class="mb-6 rounded border border-sys-naranja/40 bg-sys-naranja/10 p-4 space-y-3"
    role="alert"
    data-testid="duplicate-warning"
  >
    <p class="text-sm font-medium text-sys-profundo">
      Esta empresa ya tiene auditorías activas del mismo tipo:
    </p>
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-[var(--sys-text-muted-light)]">
          <th class="pb-2 pr-3">Referencia</th>
          <th class="pb-2 pr-3">Estado</th>
          <th class="pb-2">Encargada</th>
        </tr>
      </thead>
      <tbody>
        {#each form.conflicts as conflict}
          <tr>
            <td class="py-1 pr-3 font-mono">{conflict.refCode}</td>
            <td class="py-1 pr-3"><AuditStatusBadge status={conflict.status} /></td>
            <td class="py-1">{conflict.encargada ?? '—'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="text-xs text-[var(--sys-text-muted-light)]">
      Podés crear igualmente; se asignará el siguiente número correlativo.
    </p>
  </div>
{/if}

<form method="POST" action="?/create" class="space-y-6 max-w-2xl">
  {#if form?.duplicateWarning}
    <input type="hidden" name="confirmDuplicate" value="true" />
  {/if}

  <ClientPicker
    initialClient={data.preselectedEmpresa
      ? {
          id: data.preselectedEmpresa.id,
          razonSocial: data.preselectedEmpresa.cabFields.razonSocial,
          cuit: data.preselectedEmpresa.cabFields.cuit,
          cabFields: data.preselectedEmpresa.cabFields
        }
      : null}
    onClientSelect={prefillCabFromClient}
    onNewClientChange={prefillCabFromNewClient}
  />

  <fieldset class="space-y-2">
    <legend class="text-sm font-semibold text-sys-profundo">Tipo de auditoría</legend>
    {#each selectableTypes as type}
      <label class="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name="types"
          value={type}
          checked={selectedType === type}
          onchange={() => (selectedType = type)}
          required
        />
        {AUDIT_TYPE_LABELS[type]}
      </label>
    {/each}
  </fieldset>

  <label class="block space-y-1">
    <span class="text-sm font-medium text-sys-medio">Segmento</span>
    <select name="segment" required class="w-full rounded border border-[var(--sys-border-subtle)] px-3 py-2 text-sm">
      <option value="A">A</option>
      <option value="B">B</option>
      <option value="C">C</option>
    </select>
  </label>

  <label class="block space-y-1">
    <span class="text-sm font-medium text-sys-medio">Técnico encargado</span>
    <select
      name={`techByType[${selectedType}]`}
      required
      class="w-full rounded border border-[var(--sys-border-subtle)] px-3 py-2 text-sm"
    >
      {#each techniciansFor(selectedType) as tech (tech.id)}
        <option value={tech.id}>{tech.name}</option>
      {/each}
    </select>
  </label>

  <label class="block space-y-1">
    <span class="text-sm font-medium text-sys-medio">Fecha de visita</span>
    <input
      type="date"
      name="scheduledAt"
      bind:value={scheduledAt}
      onchange={syncScheduledAtToCab}
      required
      class="w-full rounded border border-[var(--sys-border-subtle)] px-3 py-2 text-sm"
    />
  </label>

  <CabSectionForm items={cabItems} />

  <button
    type="submit"
    class="rounded bg-sys-profundo px-4 py-2 text-sm font-medium text-white hover:bg-sys-medio"
  >
    {form?.duplicateWarning ? 'Crear igualmente' : 'Crear auditoría'}
  </button>
</form>
