<script lang="ts">
  import { deserialize } from '$app/forms';
  import type { ClientCabFields } from '$lib/backoffice/cab-client-map';

  type ClientRow = {
    id: string;
    razonSocial: string;
    cuit: string | null;
    cabFields?: ClientCabFields;
  };

  let {
    selectedClientId = '',
    showNewClient = false,
    onClientSelect,
    onNewClientChange,
    onClearClient
  }: {
    selectedClientId?: string;
    showNewClient?: boolean;
    onClientSelect?: (clientId: string, cabFields: ClientCabFields) => void;
    onNewClientChange?: (data: { razonSocial: string; cuit: string; rubro: string }) => void;
    onClearClient?: () => void;
  } = $props();

  let mode = $state<'existing' | 'new'>(showNewClient ? 'new' : 'existing');
  let selectedId = $state(selectedClientId);
  let selectedClient = $state<ClientRow | null>(null);
  let query = $state('');
  let open = $state(false);
  let searching = $state(false);
  let searchResults = $state<ClientRow[]>([]);
  let listboxId = 'client-picker-listbox';
  let newRazonSocial = $state('');
  let newCuit = $state('');
  let newRubro = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  const filteredClients = $derived(searchResults);

  $effect(() => {
    if (selectedClientId && selectedClientId !== selectedId) {
      selectedId = selectedClientId;
    }
  });

  async function runSearch(term: string) {
    const q = term.trim();
    if (q.length < 2) {
      searchResults = [];
      searching = false;
      return;
    }

    searching = true;
    const fd = new FormData();
    fd.set('q', q);

    try {
      const res = await fetch('?/searchClients', { method: 'POST', body: fd });
      const result = deserialize(await res.text());
      if (result.type === 'success' && result.data?.clients) {
        searchResults = result.data.clients as ClientRow[];
      } else {
        searchResults = [];
      }
    } catch {
      searchResults = [];
    } finally {
      searching = false;
    }
  }

  function scheduleSearch(term: string) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void runSearch(term);
    }, 250);
  }

  function selectClient(client: ClientRow) {
    selectedId = client.id;
    selectedClient = client;
    query = client.razonSocial;
    open = false;
    if (client.cabFields) {
      onClientSelect?.(client.id, client.cabFields);
    }
  }

  function clearSelection() {
    selectedId = '';
    selectedClient = null;
    query = '';
    searchResults = [];
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
    if (query.trim().length >= 2) {
      scheduleSearch(query);
    }
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
      selectedClient = null;
    }
    scheduleSearch(query);
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

      <select
        name="clientId"
        bind:value={selectedId}
        required={mode === 'existing'}
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
      >
        <option value="">Seleccionar...</option>
        {#if selectedClient}
          <option value={selectedClient.id}>{selectedClient.razonSocial}</option>
        {/if}
      </select>

      <div class="relative">
        <input
          type="search"
          bind:value={query}
          onfocus={onSearchFocus}
          onblur={onSearchBlur}
          oninput={onSearchInput}
          onkeydown={onSearchKeydown}
          placeholder="Buscar por razón social o CUIT (mín. 2 caracteres)..."
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

        {#if open && searching}
          <p
            class="absolute z-10 mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg"
          >
            Buscando...
          </p>
        {:else if open && query.trim().length >= 2 && filteredClients.length > 0}
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
                  onclick={() => selectClient(c)}
                >
                  <span class="block font-medium">{c.razonSocial}</span>
                  {#if c.cuit}
                    <span class="block text-xs text-slate-500">{c.cuit}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {:else if open && query.trim().length >= 2 && !searching && filteredClients.length === 0}
          <p
            class="absolute z-10 mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg"
          >
            Sin resultados para "{query.trim()}"
          </p>
        {:else if open && query.trim().length > 0 && query.trim().length < 2}
          <p
            class="absolute z-10 mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-lg"
          >
            Escribí al menos 2 caracteres para buscar
          </p>
        {/if}
      </div>
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
