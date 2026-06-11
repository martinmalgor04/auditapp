<script lang="ts">
  import { AUDIT_STATUSES } from '$lib/audit-status';
  import { AUDIT_TYPE_LABELS, type AuditType } from '$lib/audit-types';

  let {
    clients,
    filters,
    allowedTypes = null
  }: {
    clients: Array<{ id: string; razonSocial: string }>;
    filters: {
      type?: string;
      status?: string;
      clientId?: string;
      q?: string;
      sort?: string;
      page?: number;
    };
    allowedTypes?: AuditType[] | null;
  } = $props();

  const TYPE_OPTIONS = $derived(
    (allowedTypes ?? (Object.keys(AUDIT_TYPE_LABELS) as AuditType[])).map((value) => ({
      value,
      label: AUDIT_TYPE_LABELS[value]
    }))
  );

  const SORT_OPTIONS = [
    { value: 'last_activity_desc', label: 'Última actividad ↓' },
    { value: 'last_activity_asc', label: 'Última actividad ↑' },
    { value: 'scheduled_at_desc', label: 'Fecha visita ↓' },
    { value: 'scheduled_at_asc', label: 'Fecha visita ↑' }
  ];
</script>

<form
  method="GET"
  class="sys-card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 md:flex md:flex-wrap md:items-end"
>
  <label class="space-y-1.5">
    <span class="sys-field-label-xs">Tipo</span>
    <select name="type" class="sys-field md:w-auto">
      <option value="">Todos</option>
      {#each TYPE_OPTIONS as opt}
        <option value={opt.value} selected={filters.type === opt.value}>{opt.label}</option>
      {/each}
    </select>
  </label>

  <label class="space-y-1.5">
    <span class="sys-field-label-xs">Estado</span>
    <select name="status" class="sys-field md:w-auto">
      <option value="">Todos</option>
      {#each AUDIT_STATUSES as st}
        <option value={st} selected={filters.status === st}>{st}</option>
      {/each}
    </select>
  </label>

  <label class="space-y-1.5">
    <span class="sys-field-label-xs">Cliente</span>
    <select name="clientId" class="sys-field md:min-w-[12rem] md:w-auto">
      <option value="">Todos</option>
      {#each clients as c}
        <option value={c.id} selected={filters.clientId === c.id}>{c.razonSocial}</option>
      {/each}
    </select>
  </label>

  <label class="space-y-1.5 sm:col-span-2 md:min-w-[12rem] md:flex-1">
    <span class="sys-field-label-xs">Buscar</span>
    <input
      type="search"
      name="q"
      value={filters.q ?? ''}
      placeholder="Razón social..."
      class="sys-field"
    />
  </label>

  <label class="space-y-1.5">
    <span class="sys-field-label-xs">Orden</span>
    <select name="sort" class="sys-field md:w-auto">
      {#each SORT_OPTIONS as opt}
        <option value={opt.value} selected={filters.sort === opt.value}>{opt.label}</option>
      {/each}
    </select>
  </label>

  <button type="submit" class="sys-btn-primary sys-btn-sm w-full md:w-auto">Filtrar</button>
</form>
