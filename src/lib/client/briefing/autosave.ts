import { AUTOSAVE_DEBOUNCE_MS } from '$lib/client/form/autosave';

export type BriefingSaveState = 'idle' | 'saving' | 'saved' | 'error';

const IMMEDIATE_FIELD_TYPES = new Set(['bool', 'tri', 'select']);

type PendingPayload = { itemId: string; value: unknown; na: boolean };

export function createBriefingAutosave(
  token: string,
  callbacks: { onStateChange?: (state: BriefingSaveState) => void } = {}
) {
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingPayloads = new Map<string, PendingPayload>();
  const inflight = new Set<Promise<void>>();

  async function patch(payload: PendingPayload): Promise<void> {
    callbacks.onStateChange?.('saving');
    try {
      const res = await fetch(`/api/briefing/${token}/responses`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        callbacks.onStateChange?.('error');
        return;
      }
      callbacks.onStateChange?.('saved');
      setTimeout(() => callbacks.onStateChange?.('idle'), 2000);
    } catch {
      callbacks.onStateChange?.('error');
    }
  }

  function scheduleSave(itemId: string, value: unknown, fieldType: string) {
    const payload: PendingPayload = { itemId, value, na: false };
    pendingPayloads.set(itemId, payload);

    const delay = fieldType && IMMEDIATE_FIELD_TYPES.has(fieldType) ? 0 : AUTOSAVE_DEBOUNCE_MS;
    const existing = debounceTimers.get(itemId);
    if (existing) clearTimeout(existing);

    const run = () => {
      debounceTimers.delete(itemId);
      const pending = pendingPayloads.get(itemId);
      pendingPayloads.delete(itemId);
      if (!pending) return;
      const p = patch(pending).finally(() => inflight.delete(p));
      inflight.add(p);
    };

    if (delay === 0) {
      pendingPayloads.delete(itemId);
      const p = patch(payload).finally(() => inflight.delete(p));
      inflight.add(p);
    } else {
      debounceTimers.set(itemId, setTimeout(run, delay));
    }
  }

  async function flushPending(): Promise<void> {
    for (const itemId of [...debounceTimers.keys()]) {
      const timer = debounceTimers.get(itemId);
      if (timer) clearTimeout(timer);
      debounceTimers.delete(itemId);
      const pending = pendingPayloads.get(itemId);
      pendingPayloads.delete(itemId);
      if (pending) {
        const p = patch(pending).finally(() => inflight.delete(p));
        inflight.add(p);
      }
    }
    await Promise.all([...inflight]);
  }

  return { scheduleSave, flushPending };
}
