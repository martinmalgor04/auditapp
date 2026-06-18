import type { SaveIndicatorState } from '$lib/components/form/save-indicator.svelte';

// T1 — Lógica pura de feedback de fila de tabla (extraída para testeo, R1, R10)

export type RowFeedback = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

export function rowFeedback(
  rowId: string,
  saveState: SaveIndicatorState,
  lastSavedRowId: string | null
): RowFeedback {
  if (rowId !== lastSavedRowId) return 'idle';
  return saveState;
}

export function saveButtonLabel(fb: RowFeedback): string {
  if (fb === 'saving') return 'Guardando…';
  if (fb === 'saved') return 'Guardado ✓';
  return 'Guardar fila';
}

export function saveButtonDisabled(fb: RowFeedback): boolean {
  return fb === 'saving';
}

export function rowShowsFlash(fb: RowFeedback): boolean {
  return fb === 'saved';
}

export function rowShowsError(fb: RowFeedback): boolean {
  return fb === 'error';
}
