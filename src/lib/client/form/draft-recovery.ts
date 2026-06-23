import type { SavePayload } from './autosave';
import type { FormDraft } from './draft-store';

export type ItemState = { value: unknown; na: boolean; notes: string | null };

export function snapshotResponsesFromMap(
  itemLocalState: Map<string, ItemState>
): FormDraft['responses'] {
  const responses: FormDraft['responses'] = {};
  for (const [itemId, r] of itemLocalState) {
    responses[itemId] = { value: r.value, na: r.na, notes: r.notes };
  }
  return responses;
}

export function buildDraftPayload(
  auditId: string,
  itemLocalState: Map<string, ItemState>,
  savedAt = new Date().toISOString()
): FormDraft {
  return {
    auditId,
    savedAt,
    responses: snapshotResponsesFromMap(itemLocalState)
  };
}

export function shouldDeleteDraftAfterSync(outcome: string, queueLength: number): boolean {
  return outcome === 'saved' && queueLength === 0;
}

export async function maybeDeleteDraftWhenSynced(
  auditId: string,
  outcome: string,
  listQueuedFn: (auditId: string) => Promise<unknown[]>,
  deleteDraftFn: (auditId: string) => Promise<void>
): Promise<{ queueLength: number; deleted: boolean }> {
  if (outcome !== 'saved') {
    const queued = await listQueuedFn(auditId);
    return { queueLength: queued.length, deleted: false };
  }

  const queued = await listQueuedFn(auditId);
  const deleted = shouldDeleteDraftAfterSync(outcome, queued.length);
  if (deleted) {
    await deleteDraftFn(auditId);
  }
  return { queueLength: queued.length, deleted };
}

export function resolvePendingDraftOnMount(draft: FormDraft | null): FormDraft | null {
  return draft ?? null;
}

export function shouldRenderDraftBanner(pendingDraft: FormDraft | null): boolean {
  return pendingDraft !== null;
}

export function formatDraftSavedAtLocal(savedAt: string): string {
  return new Date(savedAt).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short'
  });
}

export function applyDraftToFormState(
  draft: FormDraft,
  current: Map<string, ItemState>
): { state: Map<string, ItemState>; dirtyIds: string[] } {
  const state = new Map(current);
  const dirtyIds: string[] = [];

  for (const [itemId, r] of Object.entries(draft.responses)) {
    state.set(itemId, { value: r.value, na: r.na, notes: r.notes });
    dirtyIds.push(itemId);
  }

  return { state, dirtyIds };
}

export type RestoreDraftParams = {
  draft: FormDraft;
  itemLocalState: Map<string, ItemState>;
  getFieldType: (itemId: string) => string;
  scheduleSave: (
    itemId: string,
    fieldType: string,
    payload: Omit<SavePayload, 'itemId'>
  ) => void;
};

/** Aplica el draft en memoria y encola autosave debounced; no llama patch. */
export function restoreDraft(params: RestoreDraftParams): Map<string, ItemState> {
  const { draft, itemLocalState, getFieldType, scheduleSave } = params;
  const { state, dirtyIds } = applyDraftToFormState(draft, itemLocalState);

  for (const itemId of dirtyIds) {
    const item = state.get(itemId);
    if (!item) continue;
    scheduleSave(itemId, getFieldType(itemId), {
      value: item.value,
      na: item.na,
      notes: item.notes
    });
  }

  return state;
}

export async function discardPendingDraft(
  auditId: string,
  deleteDraftFn: (auditId: string) => Promise<void>
): Promise<void> {
  await deleteDraftFn(auditId);
}
