<script lang="ts">
  import SysButton from '$lib/components/brand/SysButton.svelte';
  import SysInput from '$lib/components/brand/SysInput.svelte';

  export type FilaInventarioUi = {
    itemId: string;
    itemLabel: string;
    sectionTitle: string;
    rowId: string;
    resumen: string;
  };

  let { filas, onClose }: { filas: FilaInventarioUi[]; onClose: () => void } = $props();

  let busqueda = $state('');
  let seleccion = $state('');

  const filtradas = $derived.by(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((f) =>
      `${f.sectionTitle} ${f.itemLabel} ${f.resumen}`.toLowerCase().includes(q)
    );
  });

  const destino = $derived(seleccion.split('|'));
  const itemIdSel = $derived(destino[0] ?? '');
  const rowIdSel = $derived(destino[1] ?? '');
</script>

<!-- R21: fusión = vínculo a una fila del relevamiento manual (OQ1: no copia datos) -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-sys-navy/60 p-4"
  data-testid="fusionar-panel"
  role="dialog"
  aria-modal="true"
>
  <div class="flex max-h-[90vh] w-full max-w-lg flex-col rounded-sys bg-white p-6 shadow-sys-card">
    <h3 class="text-lg font-semibold text-sys-profundo">Fusionar con relevamiento manual</h3>
    <p class="mt-1 text-sm text-sys-medio">
      El dispositivo queda vinculado a la fila elegida. El dato manual no se modifica.
    </p>

    <form method="POST" action="?/fusionar" class="mt-4 flex min-h-0 flex-1 flex-col gap-3">
      <SysInput
        placeholder="Buscar por sección, ítem o contenido…"
        value={busqueda}
        oninput={(e) => {
          busqueda = (e.currentTarget as HTMLInputElement).value;
        }}
        data-testid="fusionar-busqueda"
      />

      <input type="hidden" name="itemId" value={itemIdSel} />
      <input type="hidden" name="rowId" value={rowIdSel} />

      <div class="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-sys border border-sys-borde p-2">
        {#each filtradas as f (f.itemId + '|' + f.rowId)}
          <label
            class="flex min-h-[var(--sys-touch-min)] cursor-pointer items-start gap-2 rounded-sys px-2 py-2 text-sm hover:bg-sys-offwhite has-checked:bg-sys-status-blue-bg/40"
            data-testid="fusionar-fila"
          >
            <input
              type="radio"
              name="fila"
              value="{f.itemId}|{f.rowId}"
              bind:group={seleccion}
              class="mt-1"
            />
            <span class="min-w-0">
              <span class="block text-xs text-sys-text-faint">{f.sectionTitle} · {f.itemLabel}</span>
              <span class="block truncate text-sys-profundo">{f.resumen || '(fila sin datos)'}</span>
            </span>
          </label>
        {:else}
          <p class="px-2 py-6 text-center text-sm text-sys-medio">
            {filas.length === 0
              ? 'El relevamiento manual no tiene filas en ítems-tabla todavía'
              : 'Sin filas para la búsqueda'}
          </p>
        {/each}
      </div>

      <label class="flex flex-col gap-1 text-sm">
        <span class="text-sys-medio">Nota (opcional)</span>
        <textarea
          name="nota"
          rows="2"
          class="rounded-sys border border-sys-borde px-3 py-2 text-sm"
          placeholder="Por qué se fusionan…"
          data-testid="fusionar-nota"
        ></textarea>
      </label>

      <div class="flex gap-2">
        <SysButton type="submit" variant="primary" disabled={!seleccion} data-testid="fusionar-submit">
          Fusionar
        </SysButton>
        <SysButton variant="secondary" onclick={onClose}>Cancelar</SysButton>
      </div>
    </form>
  </div>
</div>
