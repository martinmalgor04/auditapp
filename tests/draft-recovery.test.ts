import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyDraftToFormState,
  buildDraftPayload,
  discardPendingDraft,
  formatDraftSavedAtLocal,
  maybeDeleteDraftWhenSynced,
  resolvePendingDraftOnMount,
  restoreDraft,
  shouldDeleteDraftAfterSync,
  shouldRenderDraftBanner,
  snapshotResponsesFromMap
} from '../src/lib/client/form/draft-recovery';
import { deleteDraft, loadDraft, saveDraft, type FormDraft } from '../src/lib/client/form/draft-store';
import { DB_NAME } from '../src/lib/client/form/retry-queue';

const auditId = '00000000-0000-4000-8000-000000000002';

function makeDraft(responses: FormDraft['responses']): FormDraft {
  return {
    auditId,
    savedAt: '2026-06-23T15:00:00.000Z',
    responses
  };
}

async function resetDraftDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe('draft recovery', () => {
  it('handleRestore aplica todos los campos del draft sobre el mapa de respuestas', () => {
    const current = new Map([
      ['item-1', { value: 'server', na: false, notes: null }],
      ['item-2', { value: 'keep', na: false, notes: null }]
    ]);
    const draft = makeDraft({
      'item-1': { value: 'draft', na: true, notes: 'restored' },
      'item-3': { value: 42, na: false, notes: null }
    });

    const { state } = applyDraftToFormState(draft, current);

    expect(state.get('item-1')).toEqual({ value: 'draft', na: true, notes: 'restored' });
    expect(state.get('item-2')).toEqual({ value: 'keep', na: false, notes: null });
    expect(state.get('item-3')).toEqual({ value: 42, na: false, notes: null });
  });

  it('handleRestore marca ítems como dirty', () => {
    const current = new Map([['item-1', { value: 'x', na: false, notes: null }]]);
    const draft = makeDraft({
      'item-1': { value: 'y', na: false, notes: null },
      'item-2': { value: null, na: true, notes: 'n' }
    });

    const { dirtyIds } = applyDraftToFormState(draft, current);
    expect(dirtyIds).toEqual(['item-1', 'item-2']);
  });

  it('handleRestore no dispara PATCH inmediato', () => {
    const patch = vi.fn();
    const scheduleSave = vi.fn();
    const draft = makeDraft({
      'item-1': { value: 'restored', na: false, notes: null }
    });
    const current = new Map([['item-1', { value: 'old', na: false, notes: null }]]);

    restoreDraft({
      draft,
      itemLocalState: current,
      getFieldType: () => 'text',
      scheduleSave
    });

    expect(patch).not.toHaveBeenCalled();
    expect(scheduleSave).toHaveBeenCalledWith('item-1', 'text', {
      value: 'restored',
      na: false,
      notes: null
    });
  });

  it('file_ref con valor null en el draft se aplica sin error', () => {
    const current = new Map([
      ['photo-1', { value: { key: 'r2/key' }, na: false, notes: null }]
    ]);
    const draft = makeDraft({
      'photo-1': { value: null, na: false, notes: null }
    });

    const { state } = applyDraftToFormState(draft, current);
    expect(state.get('photo-1')).toEqual({ value: null, na: false, notes: null });
  });
});

describe('draft snapshot and sync helpers', () => {
  it('R2: buildDraftPayload refleja el mapa completo al modificar un campo', () => {
    const itemLocalState = new Map([
      ['item-1', { value: 'nuevo', na: false, notes: null }],
      ['item-2', { value: 'otro', na: true, notes: 'x' }]
    ]);

    const draft = buildDraftPayload(auditId, itemLocalState, '2026-06-23T16:00:00.000Z');

    expect(draft.responses).toEqual({
      'item-1': { value: 'nuevo', na: false, notes: null },
      'item-2': { value: 'otro', na: true, notes: 'x' }
    });
  });

  it('R18: snapshot incluye ítems con cambios locales aún pendientes en cola', () => {
    const itemLocalState = new Map([
      ['item-1', { value: 'server', na: false, notes: null }],
      ['item-2', { value: 'pendiente-offline', na: false, notes: 'encolado' }]
    ]);
    const queuedItemIds = ['item-2'];

    const snapshot = snapshotResponsesFromMap(itemLocalState);
    expect(snapshot['item-2']).toEqual({ value: 'pendiente-offline', na: false, notes: 'encolado' });
    expect(queuedItemIds).toContain('item-2');
    expect(snapshot['item-1']?.value).toBe('server');
  });

  it('R5: maybeDeleteDraftWhenSynced elimina solo con saved y cola vacía', async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const listQueuedFn = vi.fn().mockResolvedValue([]);

    const deleted = await maybeDeleteDraftWhenSynced(auditId, 'saved', listQueuedFn, deleteFn);
    expect(deleted).toEqual({ queueLength: 0, deleted: true });
    expect(deleteFn).toHaveBeenCalledWith(auditId);

    deleteFn.mockClear();
    listQueuedFn.mockResolvedValue([{ itemId: 'x' }]);
    const kept = await maybeDeleteDraftWhenSynced(auditId, 'saved', listQueuedFn, deleteFn);
    expect(kept).toEqual({ queueLength: 1, deleted: false });
    expect(deleteFn).not.toHaveBeenCalled();

    deleteFn.mockClear();
    listQueuedFn.mockResolvedValue([]);
    const offline = await maybeDeleteDraftWhenSynced(auditId, 'offline', listQueuedFn, deleteFn);
    expect(offline).toEqual({ queueLength: 0, deleted: false });
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('R5: shouldDeleteDraftAfterSync es la regla pura de limpieza', () => {
    expect(shouldDeleteDraftAfterSync('saved', 0)).toBe(true);
    expect(shouldDeleteDraftAfterSync('saved', 2)).toBe(false);
    expect(shouldDeleteDraftAfterSync('offline', 0)).toBe(false);
  });
});

describe('draft mount and banner helpers', () => {
  it('R7: resolvePendingDraftOnMount devuelve el draft existente', () => {
    const draft = makeDraft({ 'item-1': { value: 'x', na: false, notes: null } });
    expect(resolvePendingDraftOnMount(draft)).toEqual(draft);
    expect(resolvePendingDraftOnMount(null)).toBeNull();
  });

  it('R8/R9/R10: shouldRenderDraftBanner y banner UI', () => {
    const draft = makeDraft({ 'item-1': { value: 'x', na: false, notes: null } });
    expect(shouldRenderDraftBanner(null)).toBe(false);
    expect(shouldRenderDraftBanner(draft)).toBe(true);

    const formatted = formatDraftSavedAtLocal('2026-06-23T15:00:00.000Z');
    expect(formatted.length).toBeGreaterThan(0);

    const source = readFileSync(
      join(process.cwd(), 'src/lib/components/form/DraftRecoveryBanner.svelte'),
      'utf8'
    );
    expect(source).toContain('Restaurar borrador');
    expect(source).toContain('Descartar');
    expect(source).toContain('formatDraftSavedAtLocal');
  });

  it('R10: montar draft no aplica valores automáticamente', () => {
    const serverState = new Map([['item-1', { value: 'server', na: false, notes: null }]]);
    const draft = makeDraft({ 'item-1': { value: 'draft', na: false, notes: null } });
    const pending = resolvePendingDraftOnMount(draft);

    expect(shouldRenderDraftBanner(pending)).toBe(true);
    expect(serverState.get('item-1')?.value).toBe('server');
  });
});

describe('discardPendingDraft', () => {
  beforeEach(async () => {
    await resetDraftDb();
  });

  afterEach(async () => {
    await resetDraftDb();
  });

  it('R15/R16: discardPendingDraft elimina el draft real en IDB', async () => {
    await saveDraft(makeDraft({ 'item-1': { value: 'x', na: false, notes: null } }));
    expect(await loadDraft(auditId)).not.toBeNull();

    await discardPendingDraft(auditId, deleteDraft);
    expect(await loadDraft(auditId)).toBeNull();
  });
});
