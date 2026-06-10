<script lang="ts">
  let {
    clients,
    selectedClientId = '',
    showNewClient = false,
    onClientSelect,
    onNewClientChange,
    onClearClient
  }: {
    clients: Array<{ id: string; razonSocial: string; cuit: string | null }>;
    selectedClientId?: string;
    showNewClient?: boolean;
    onClientSelect?: (clientId: string) => void;
    onNewClientChange?: (data: { razonSocial: string; cuit: string; rubro: string }) => void;
    onClearClient?: () => void;
  } = $props();

  let mode = $state<'existing' | 'new'>(showNewClient ? 'new' : 'existing');
  let selectedId = $state(selectedClientId);
  let query = $state('');
  let open = $state(false);
  let listboxId = 'client-picker-listbox';
  let newRazonSocial = $state('');
  let newCuit = $state('');
  let newRubro = $state('');

  const selectedClient = $derived(clients.find((c) => c.id === selectedId));

  const filteredClients = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? clients.filter(
          (c) =>
            c.razonSocial.toLowerCase().includes(q) ||
            (c.cuit?.toLowerCase().includes(q) ?? false)
        )
      : clients;
    return list.slice(0, 50);
  });

  $effect(() => {
    if (selectedClientId && selectedClientId !== selectedId) {
      selectedId = selectedClientId;
      query = clients.find((c) => c.id === selectedClientId)?.razonSocial ?? '';
    }
  });

  function selectClient(id: string) {
    selectedId = id;
    query = clients.find((c) => c.id === id)?.razonSocial ?? '';
    open = false;
    onClientSelect?.(id);
  }

  function clearSelection() {
    selectedId = '';
    query = '';
    onClearClient?.();
  }

  function emitNewClientChange() {
    onNewClientChange?.({
      razonSocial: newRazonSocial,
      cuit: newCuit,
      rubro: newRubro
    });
  }

  function onSearchFocus() {
    open = true;
  }

  function onSearchBlur() {
    setTimeout(() => {
      open = false;
      if (selectedClient) {
        query = selectedClient.razonSocial;
      } else if (query.trim() && !selectedId) {
        query = '';
      }
    }, 150);
  }

  function onSearchInput() {
    open = true;
    if (selectedId && query !== selectedClient?.razonSocial) {
      selectedId = '';
    }
  }

  function onSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      open = false;
      if (selectedClient) query = selectedClient.razonSocial;
    }
  }
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
    <div class="relative block space-y-1">
      <span class="text-sm font-medium text-slate-700">Cliente</span>

      <!-- Select oculto para validación nativa del formulario -->
      <select
        name="clientId"
        bind:value={selectedId}
        required={mode === 'existing'}
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
      >
        <option value="">Seleccionar...</option>
        {#each clients as c}
          <option value={c.id}>{c.razonSocial}</option>
        {/each}
      </select>

      <div class="relative">
        <input
          type="search"
          bind:value={query}
          onfocus={onSearchFocus}
          onblur={onSearchBlur}
          oninput={onSearchInput}
          onkeydown={onSearchKeydown}
          placeholder="Buscar por razón social o CUIT..."
          autocomplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label="Buscar cliente"
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm pr-8"
        />
        {#if selectedId}
          <button
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Limpiar selección"
            onclick={clearSelection}
          >
            ×
          </button>
        {/if}

        {#if open && filteredClients.length > 0}
          <ul
            id={listboxId}
            role="listbox"
            class="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded border border-slate-200 bg-white py-1 shadow-lg"
          >
            {#each filteredClients as c (c.id)}
              <li role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedId === c.id}
                  class="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 {selectedId === c.id
                    ? 'bg-blue-50 text-blue-900'
                    : 'text-slate-800'}"
                  onmousedown={(e) => e.preventDefault()}
                  onclick={() => selectClient(c.id)}
                >
                  <span class="block font-medium">{c.razonSocial}</span>
                  {#if c.cuit}
                    <span class="block text-xs text-slate-500">{c.cuit}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {:else if open && query.trim() && filteredClients.length === 0}
          <p
            class="absolute z-10 mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg"
          >
            Sin resultados para "{query.trim()}"
          </p>
        {/if}
      </div>

      {#if clients.length === 0}
        <p class="text-xs text-amber-600">No hay clientes cargados. Usá "Cliente nuevo" o ejecutá el seed.</p>
      {/if}
    </div>
  {:else}
    <div class="grid gap-3 sm:grid-cols-3">
      <label class="block space-y-1 sm:col-span-2">
        <span class="text-sm font-medium text-slate-700">Razón social</span>
        <input
          type="text"
          name="newRazonSocial"
          bind:value={newRazonSocial}
          oninput={emitNewClientChange}
          required={mode === 'new'}
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label class="block space-y-1">
        <span class="text-sm font-medium text-slate-700">CUIT</span>
        <input
          type="text"
          name="newCuit"
          bind:value={newCuit}
          oninput={emitNewClientChange}
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label class="block space-y-1 sm:col-span-3">
        <span class="text-sm font-medium text-slate-700">Rubro</span>
        <input
          type="text"
          name="newRubro"
          bind:value={newRubro}
          oninput={emitNewClientChange}
          class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
    </div>
  {/if}
</div>
