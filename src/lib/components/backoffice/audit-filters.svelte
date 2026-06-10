<script lang="ts">
  import { AUDIT_STATUSES } from '$lib/audit-status';

  let {
    clients,
    filters
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
  } = $props();

  const TYPE_OPTIONS = [
    { value: 'it', label: 'IT' },
    { value: 'erp-tango', label: 'ERP Tango' },
    { value: 'erp-estandar', label: 'ERP Estándar' }
  ];

  const SORT_OPTIONS = [
    { value: 'last_activity_desc', label: 'Última actividad ↓' },
    { value: 'last_activity_asc', label: 'Última actividad ↑' },
    { value: 'scheduled_at_desc', label: 'Fecha visita ↓' },
    { value: 'scheduled_at_asc', label: 'Fecha visita ↑' }
  ];
</script>

<form
  method="GET"
  class="grid grid-cols-1 gap-3 p-4 bg-white rounded-lg border border-slate-200 sm:grid-cols-2 md:flex md:flex-wrap md:items-end"
>
  <label class="space-y-1">
    <span class="text-xs font-medium text-slate-600">Tipo</span>
    <select name="type" class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm md:w-auto">
      <option value="">Todos</option>
      {#each TYPE_OPTIONS as opt}
        <option value={opt.value} selected={filters.type === opt.value}>{opt.label}</option>
      {/each}
    </select>
  </label>

  <label class="space-y-1">
    <span class="text-xs font-medium text-slate-600">Estado</span>
    <select name="status" class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm md:w-auto">
      <option value="">Todos</option>
      {#each AUDIT_STATUSES as st}
        <option value={st} selected={filters.status === st}>{st}</option>
      {/each}
    </select>
  </label>

  <label class="space-y-1">
    <span class="text-xs font-medium text-slate-600">Cliente</span>
    <select name="clientId" class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm md:min-w-[12rem] md:w-auto">
      <option value="">Todos</option>
      {#each clients as c}
        <option value={c.id} selected={filters.clientId === c.id}>{c.razonSocial}</option>
      {/each}
    </select>
  </label>

  <label class="space-y-1 sm:col-span-2 md:flex-1 md:min-w-[12rem]">
    <span class="text-xs font-medium text-slate-600">Buscar</span>
    <input
      type="search"
      name="q"
      value={filters.q ?? ''}
      placeholder="Razón social..."
      class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
    />
  </label>

  <label class="space-y-1">
    <span class="text-xs font-medium text-slate-600">Orden</span>
    <select name="sort" class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm md:w-auto">
      {#each SORT_OPTIONS as opt}
        <option value={opt.value} selected={filters.sort === opt.value}>{opt.label}</option>
      {/each}
    </select>
  </label>

  <button
    type="submit"
    class="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
  >
    Filtrar
  </button>
</form>
