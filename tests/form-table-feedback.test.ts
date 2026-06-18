import { describe, expect, it } from 'vitest';
import {
  rowFeedback,
  saveButtonLabel,
  saveButtonDisabled,
  rowShowsFlash,
  rowShowsError,
  type RowFeedback
} from '$lib/components/form/fields/field-table-feedback';
import type { SaveIndicatorState } from '$lib/components/form/save-indicator.svelte';

// ---------------------------------------------------------------------------
// rowFeedback — R1, R2, R10
// ---------------------------------------------------------------------------
describe('rowFeedback', () => {
  it('devuelve idle para fila que no fue accionada (R1, R2)', () => {
    const states: SaveIndicatorState[] = ['idle', 'saving', 'saved', 'error', 'offline'];
    for (const s of states) {
      expect(rowFeedback('row-other', s, 'row-abc')).toBe('idle');
    }
  });

  it('devuelve idle cuando lastSavedRowId es null (R2)', () => {
    const states: SaveIndicatorState[] = ['saving', 'saved', 'error'];
    for (const s of states) {
      expect(rowFeedback('row-abc', s, null)).toBe('idle');
    }
  });

  it('refleja saveState para la fila accionada (R1, R10)', () => {
    const cases: Array<[SaveIndicatorState, RowFeedback]> = [
      ['idle', 'idle'],
      ['saving', 'saving'],
      ['saved', 'saved'],
      ['error', 'error'],
      ['offline', 'offline']
    ];
    for (const [state, expected] of cases) {
      expect(rowFeedback('row-abc', state, 'row-abc')).toBe(expected);
    }
  });

  it('solo la última fila accionada recibe el estado (OQ1)', () => {
    expect(rowFeedback('row-abc', 'saved', 'row-xyz')).toBe('idle');
    expect(rowFeedback('row-xyz', 'saved', 'row-xyz')).toBe('saved');
  });
});

// ---------------------------------------------------------------------------
// saveButtonLabel — R3, R5, R9
// ---------------------------------------------------------------------------
describe('saveButtonLabel', () => {
  it('muestra "Guardado ✓" solo en saved (R3)', () => {
    expect(saveButtonLabel('saved')).toBe('Guardado ✓');
  });

  it('muestra "Guardando…" en saving (R5)', () => {
    expect(saveButtonLabel('saving')).toBe('Guardando…');
  });

  it('muestra "Guardar fila" en idle/error/offline (R5, R9)', () => {
    const normal: RowFeedback[] = ['idle', 'error', 'offline'];
    for (const fb of normal) {
      expect(saveButtonLabel(fb)).toBe('Guardar fila');
    }
  });

  it('NO muestra "Guardado ✓" en error (R8)', () => {
    expect(saveButtonLabel('error')).not.toBe('Guardado ✓');
  });

  it('NO muestra "Guardado ✓" en offline (R9)', () => {
    expect(saveButtonLabel('offline')).not.toBe('Guardado ✓');
  });
});

// ---------------------------------------------------------------------------
// saveButtonDisabled — R5
// ---------------------------------------------------------------------------
describe('saveButtonDisabled', () => {
  it('está deshabilitado solo en saving (R5)', () => {
    expect(saveButtonDisabled('saving')).toBe(true);
  });

  it('está habilitado en los demás estados', () => {
    const enabled: RowFeedback[] = ['idle', 'saved', 'error', 'offline'];
    for (const fb of enabled) {
      expect(saveButtonDisabled(fb)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// rowShowsFlash — R6
// ---------------------------------------------------------------------------
describe('rowShowsFlash', () => {
  it('solo true en saved (R6)', () => {
    expect(rowShowsFlash('saved')).toBe(true);
  });

  it('false en todos los demás estados (R7 — sin layout shift inesperado)', () => {
    const others: RowFeedback[] = ['idle', 'saving', 'error', 'offline'];
    for (const fb of others) {
      expect(rowShowsFlash(fb)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// rowShowsError — R8
// ---------------------------------------------------------------------------
describe('rowShowsError', () => {
  it('solo true en error (R8)', () => {
    expect(rowShowsError('error')).toBe(true);
  });

  it('false en todos los demás estados', () => {
    const others: RowFeedback[] = ['idle', 'saving', 'saved', 'offline'];
    for (const fb of others) {
      expect(rowShowsError(fb)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Mapeo savingItemId → saveState por ítem (R1, R10)
// Simula la lógica de +page.svelte: savingItemId === item.id ? saveState : 'idle'
// ---------------------------------------------------------------------------
describe('mapeo savingItemId → prop saveState por ítem', () => {
  function itemSaveState(
    savingItemId: string | null,
    itemId: string,
    globalState: SaveIndicatorState
  ): SaveIndicatorState {
    return savingItemId === itemId ? globalState : 'idle';
  }

  it('el ítem que disparó el guardado recibe el estado real (R1)', () => {
    expect(itemSaveState('item-1', 'item-1', 'saving')).toBe('saving');
    expect(itemSaveState('item-1', 'item-1', 'saved')).toBe('saved');
    expect(itemSaveState('item-1', 'item-1', 'error')).toBe('error');
  });

  it('los demás ítems reciben idle (R1)', () => {
    expect(itemSaveState('item-1', 'item-2', 'saved')).toBe('idle');
    expect(itemSaveState('item-1', 'item-3', 'error')).toBe('idle');
    expect(itemSaveState(null, 'item-1', 'saved')).toBe('idle');
  });

  it('cuando savingItemId es null, todos reciben idle (R10)', () => {
    const states: SaveIndicatorState[] = ['saving', 'saved', 'error', 'offline'];
    for (const s of states) {
      expect(itemSaveState(null, 'item-abc', s)).toBe('idle');
    }
  });

  it('no hay estados contradictorios: solo un ítem activo a la vez (R10)', () => {
    const savingItemId = 'item-2';
    const globalState: SaveIndicatorState = 'saved';
    const items = ['item-1', 'item-2', 'item-3'];
    const results = items.map((id) => itemSaveState(savingItemId, id, globalState));
    const savedCount = results.filter((s) => s === 'saved').length;
    expect(savedCount).toBe(1);
    expect(results[1]).toBe('saved');
    expect(results[0]).toBe('idle');
    expect(results[2]).toBe('idle');
  });
});
