<script lang="ts">
  import AttachmentThumb from '../attachment-thumb.svelte';
  import type { SaveIndicatorState } from '$lib/components/form/save-indicator.svelte';
  import {
    rowFeedback,
    saveButtonLabel,
    saveButtonDisabled,
    rowShowsFlash,
    rowShowsError,
    type RowFeedback
  } from './field-table-feedback';

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

  // Re-export types for consumers (field-renderer.svelte, tests)
  export type { RowFeedback };

  let {
    id,
    label,
    helpText,
    columns = [],
    rows = $bindable<TableRow[]>([]),
    saveState = 'idle' as SaveIndicatorState,
    onchange,
    oncamera,
    onremovephoto
  }: {
    id: string;
    label: string;
    helpText?: string | null;
    columns?: TableColumn[];
    rows?: TableRow[];
    saveState?: SaveIndicatorState;
    onchange?: () => void;
    oncamera?: (rowId: string) => void | Promise<void>;
    onremovephoto?: (rowId: string, attachmentId: string) => void | Promise<void>;
  } = $props();

  // T2 — Estado local: última fila accionada (R2)
  let lastSavedRowId = $state<string | null>(null);

  // T4 — Timer de confirmación (~1000ms) que revierte el botón (R4)
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;
  let showConfirmed = $state(false);

  $effect(() => {
    // Observar transición hacia saved para armar el timer
    if (saveState === 'saved' && lastSavedRowId !== null) {
      showConfirmed = true;
      if (confirmTimer) clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => {
        showConfirmed = false;
        lastSavedRowId = null;
        confirmTimer = null;
      }, 1000);
    } else if (saveState === 'error' || saveState === 'offline') {
      // Cancelar timer y suprimir confirmación en falso (R8, R9)
      if (confirmTimer) {
        clearTimeout(confirmTimer);
        confirmTimer = null;
      }
      showConfirmed = false;
    }
  });

  // Feedback efectivo: si showConfirmed=false después de saved, la fila vuelve a idle
  function effectiveFeedback(rowId: string): RowFeedback {
    if (rowId !== lastSavedRowId) return 'idle';
    if (saveState === 'saved' && !showConfirmed) return 'idle';
    return rowFeedback(rowId, saveState, lastSavedRowId);
  }

  // Mensaje aria-live: anuncia el resultado de la última fila accionada (R12)
  const ariaMessage = $derived(() => {
    if (lastSavedRowId === null) return '';
    const fb = rowFeedback(lastSavedRowId, saveState, lastSavedRowId);
    if (fb === 'saved' && showConfirmed) return 'Fila guardada';
    if (fb === 'error') return 'No se guardó la fila';
    return '';
  });

  function addRow() {
    const cells: Record<string, unknown> = {};
    for (const col of columns) {
      cells[col.key] = col.type === 'number' ? '' : '';
    }
    const newRow = { row_id: crypto.randomUUID(), cells, attachment_ids: [] };
    rows = [...rows, newRow];
    // OQ2: addRow fija lastSavedRowId a la fila creada
    lastSavedRowId = newRow.row_id;
    onchange?.();
  }

  function removeRow(rowId: string) {
    rows = rows.filter((r) => r.row_id !== rowId);
    // OQ2: removeRow deja lastSavedRowId en null (la fila ya no existe)
    if (lastSavedRowId === rowId) lastSavedRowId = null;
    onchange?.();
  }

  function updateCell(rowId: string, key: string, val: string) {
    rows = rows.map((r) =>
      r.row_id === rowId
        ? { ...r, cells: { ...r.cells, [key]: val } }
        : r
    );
    // OQ2: updateCell fija lastSavedRowId a la fila editada
    lastSavedRowId = rowId;
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

  <!-- T6 — Región aria-live por tabla (R12) -->
  <p class="sr-only" aria-live="polite" data-table-feedback={id}>
    {ariaMessage()}
  </p>

  <div class="space-y-3">
    {#each rows as row (row.row_id)}
      {@const fb = effectiveFeedback(row.row_id)}
      <!-- T5 — Flash y error en la fila (R6, R7, R8) -->
      <div
        class="rounded-lg border border-slate-200 p-3 space-y-2 row-shell"
        class:row-flash={rowShowsFlash(fb)}
        class:row-error={rowShowsError(fb)}
        data-row-id={row.row_id}
        data-row-feedback={fb}
      >
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
        <div class="flex flex-wrap gap-2 items-center">
          <!-- T3 — Botón con feedback (R3, R5, R8) -->
          <button
            type="button"
            class="row-save-btn min-h-[var(--sys-touch-min)] rounded border px-3 text-sm font-medium
              {fb === 'saved'
                ? 'border-sys-verde/40 bg-sys-verde/10 text-sys-verde'
                : fb === 'error'
                  ? 'border-sys-rojo/40 bg-sys-rojo/10 text-sys-rojo'
                  : 'border-sys-electrico/30 bg-sys-electrico/5 text-sys-electrico'}"
            disabled={saveButtonDisabled(fb)}
            onclick={() => { lastSavedRowId = row.row_id; onchange?.(); }}
          >
            {saveButtonLabel(fb)}
          </button>
          <button
            type="button"
            class="min-h-[var(--sys-touch-min)] min-w-[var(--sys-touch-min)] rounded border border-slate-300 px-3 text-sm"
            aria-label="Tomar foto de fila"
            onclick={() => void oncamera?.(row.row_id)}
          >
            📷
          </button>
          {#if row.attachment_ids.length > 0}
            <span class="self-center text-xs font-medium text-emerald-600">
              {row.attachment_ids.length} foto(s)
            </span>
          {/if}
          <button
            type="button"
            class="ml-auto text-xs text-red-600 underline"
            onclick={() => removeRow(row.row_id)}
          >
            Quitar
          </button>
        </div>
        {#if row.attachment_ids.length > 0}
          <div class="flex flex-wrap gap-2 pt-1" data-row-photos={row.row_id}>
            {#each row.attachment_ids as attachmentId (attachmentId)}
              <AttachmentThumb
                {attachmentId}
                onremove={() => onremovephoto?.(row.row_id, attachmentId)}
              />
            {/each}
          </div>
        {/if}
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

<!-- T5, T7 — Estilos: flash solo background-color (R7), reduced-motion (R13) -->
<style>
  /* Flash sobre background-color → no afecta layout (R7) */
  .row-flash { animation: row-flash var(--sys-fast, 220ms) var(--sys-ease, ease) 1; }
  @keyframes row-flash {
    0%   { background-color: color-mix(in srgb, var(--sys-verde, #22c55e) 14%, transparent); }
    100% { background-color: transparent; }
  }
  /* Error con box-shadow inset: no empuja layout (R7) */
  .row-error { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sys-rojo, #ef4444) 45%, transparent); }
  /* R13 — reduced-motion: suprimir animación, mantener texto "Guardado ✓" */
  @media (prefers-reduced-motion: reduce) {
    .row-flash { animation: none; }
  }
</style>
