<script lang="ts">
  let {
    clients,
    selectedClientId = '',
    showNewClient = false
  }: {
    clients: Array<{ id: string; razonSocial: string; cuit: string | null }>;
    selectedClientId?: string;
    showNewClient?: boolean;
  } = $props();

  let mode = $state<'existing' | 'new'>(showNewClient ? 'new' : 'existing');
</script>

<div class="space-y-3">
  <div class="flex gap-4 text-sm">
    <label class="flex items-center gap-2">
      <input type="radio" name="clientMode" value="existing" bind:group={mode} />
      Cliente existente
    </label>
    <label class="flex items-center gap-2">
      <input type="radio" name="clientMode" value="new" bind:group={mode} />
      Cliente nuevo
    </label>
  </div>

  {#if mode === 'existing'}
    <label class="block space-y-1">
      <span class="text-sm font-medium text-slate-700">Cliente</span>
      <select
        name="clientId"
        required={mode === 'existing'}
        class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Seleccionar...</option>
        {#each clients as c}
          <option value={c.id} selected={selectedClientId === c.id}>{c.razonSocial}</option>
        {/each}
      </select>
    </label>
  {:else}
    <div class="grid gap-3 sm:grid-cols-3">
      <label class="block space-y-1 sm:col-span-2">
        <span class="text-sm font-medium text-slate-700">Razón social</span>
        <input
          type="text"
          name="newRazonSocial"
          required={mode === 'new'}
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label class="block space-y-1">
        <span class="text-sm font-medium text-slate-700">CUIT</span>
        <input
          type="text"
          name="newCuit"
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label class="block space-y-1 sm:col-span-3">
        <span class="text-sm font-medium text-slate-700">Rubro</span>
        <input
          type="text"
          name="newRubro"
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
    </div>
  {/if}
</div>
