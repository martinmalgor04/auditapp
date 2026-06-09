export const AUTOSAVE_DEBOUNCE_MS = 600;

const IMMEDIATE_FIELD_TYPES = new Set([
  'bool',
  'tri',
  'select',
  'multiselect',
  'date',
  'datetime',
  'number',
  'money',
  'table',
  'file_ref'
]);

export type SavePayload = {
  itemId: string;
  value: unknown;
  na?: boolean;
  notes?: string | null;
};

export type AutosaveCallbacks = {
  onStateChange?: (state: 'idle' | 'saving' | 'saved' | 'offline') => void;
  onSectionScore?: (sectionId: string, score: number | null, band: string) => void;
};

export function createAutosave(auditId: string, callbacks: AutosaveCallbacks = {}) {
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function debounceMs(fieldType: string, isTableTextCell = false): number {
    if (IMMEDIATE_FIELD_TYPES.has(fieldType) && !isTableTextCell) return 0;
    return AUTOSAVE_DEBOUNCE_MS;
  }

  async function patch(payload: SavePayload): Promise<boolean> {
    callbacks.onStateChange?.('saving');
    try {
      const res = await fetch(`/api/audits/${auditId}/responses`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        if (res.status >= 500 || !navigator.onLine) {
          callbacks.onStateChange?.('offline');
          return false;
        }
        callbacks.onStateChange?.('idle');
        return false;
      }

      const body = await res.json();
      if (body.data?.sectionScore) {
        callbacks.onSectionScore?.(
          body.data.sectionScore.sectionId,
          body.data.sectionScore.score,
          body.data.sectionScore.band
        );
      }

      callbacks.onStateChange?.('saved');
      setTimeout(() => callbacks.onStateChange?.('idle'), 2000);
      return true;
    } catch {
      callbacks.onStateChange?.('offline');
      return false;
    }
  }

  function scheduleSave(
    itemId: string,
    fieldType: string,
    payload: Omit<SavePayload, 'itemId'>,
    isTableTextCell = false
  ) {
    const delay = debounceMs(fieldType, isTableTextCell);
    const existing = debounceTimers.get(itemId);
    if (existing) clearTimeout(existing);

    const run = () => void patch({ itemId, ...payload });

    if (delay === 0) {
      void run();
    } else {
      debounceTimers.set(itemId, setTimeout(run, delay));
    }
  }

  return { scheduleSave, patch, debounceMs, IMMEDIATE_FIELD_TYPES };
}
