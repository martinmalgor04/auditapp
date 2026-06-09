<script lang="ts">
  export type TableRow = {
    row_id: string;
    cells: Record<string, unknown>;
    attachment_ids: string[];
  };

  export type TableColumn = {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select';
  };

  let {
    id,
    label,
    helpText,
    columns = [],
    rows = $bindable<TableRow[]>([]),
    onchange,
    oncamera
  }: {
    id: string;
    label: string;
    helpText?: string | null;
    columns?: TableColumn[];
    rows?: TableRow[];
    onchange?: () => void;
    oncamera?: (rowId: string) => void;
  } = $props();

  function addRow() {
    const cells: Record<string, unknown> = {};
    for (const col of columns) {
      cells[col.key] = col.type === 'number' ? '' : '';
    }
    rows = [
      ...rows,
      { row_id: crypto.randomUUID(), cells, attachment_ids: [] }
    ];
    onchange?.();
  }

  function removeRow(rowId: string) {
    rows = rows.filter((r) => r.row_id !== rowId);
    onchange?.();
  }

  function updateCell(rowId: string, key: string, val: string) {
    rows = rows.map((r) =>
      r.row_id === rowId
        ? { ...r, cells: { ...r.cells, [key]: val } }
        : r
    );
    onchange?.();
  }
</script>

<div class="space-y-2" data-field-type="table">
  <div>
    <span class="block text-sm font-medium text-slate-800">{label}</span>
    {#if helpText}
      <p class="text-xs text-slate-500">{helpText}</p>
    {/if}
  </div>

  <div class="space-y-3">
    {#each rows as row (row.row_id)}
      <div class="rounded-lg border border-slate-200 p-3 space-y-2" data-row-id={row.row_id}>
        <div class="grid gap-2">
          {#each columns as col (col.key)}
            <label class="block space-y-1">
              <span class="text-xs text-slate-600">{col.label}</span>
              <input
                type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                class="w-full min-h-[var(--sys-touch-min)] rounded border border-slate-300 px-2 py-1 text-sm"
                value={String(row.cells[col.key] ?? '')}
                oninput={(e) => updateCell(row.row_id, col.key, e.currentTarget.value)}
              />
            </label>
          {/each}
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="min-h-[var(--sys-touch-min)] min-w-[var(--sys-touch-min)] rounded border border-slate-300 px-3 text-sm"
            aria-label="Tomar foto de fila"
            onclick={() => oncamera?.(row.row_id)}
          >
            📷
          </button>
          {#if row.attachment_ids.length > 0}
            <span class="text-xs text-emerald-600 self-center">{row.attachment_ids.length} foto(s)</span>
          {/if}
          <button
            type="button"
            class="ml-auto text-xs text-red-600 underline"
            onclick={() => removeRow(row.row_id)}
          >
            Quitar
          </button>
        </div>
      </div>
    {/each}
  </div>

  <button
    type="button"
    class="w-full min-h-[var(--sys-touch-min)] rounded-[var(--sys-radius)] border border-dashed border-slate-300 text-sm"
    onclick={addRow}
  >
    + Agregar fila
  </button>
</div>
