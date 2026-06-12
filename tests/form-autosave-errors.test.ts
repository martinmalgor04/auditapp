import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAutosave } from '../src/lib/client/form/autosave';
import { flushEntries } from '../src/lib/client/form/retry-queue';

describe('autosave: manejo de errores 4xx vs red/5xx', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('4xx → estado error con mensaje del envelope y outcome "rejected" (no se encola)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ success: false, data: null, error: 'Auditoría no editable' })
      })
    );
    vi.stubGlobal('navigator', { onLine: true });

    const states: Array<[string, string | undefined]> = [];
    const { patch } = createAutosave('audit-1', {
      onStateChange: (s, m) => states.push([s, m])
    });

    const outcome = await patch({ itemId: 'item-1', value: 'x' });
    expect(outcome).toBe('rejected');
    expect(states).toContainEqual(['error', 'Auditoría no editable']);
    expect(states.map(([s]) => s)).not.toContain('idle');
  });

  it('5xx → outcome "offline" (sí reintetable)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    );
    vi.stubGlobal('navigator', { onLine: true });

    const { patch } = createAutosave('audit-1', {});
    expect(await patch({ itemId: 'item-1', value: 'x' })).toBe('offline');
  });

  it('error de red → "offline"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));
    vi.stubGlobal('navigator', { onLine: false });

    const { patch } = createAutosave('audit-1', {});
    expect(await patch({ itemId: 'item-1', value: 'x' })).toBe('offline');
  });

  it('flushQueue saca de la cola los "rejected" sin contarlos como flusheados', async () => {
    const queued = [
      { auditId: 'a1', itemId: 'i1', value: 1, enqueuedAt: '', attempts: 0 },
      { auditId: 'a1', itemId: 'i2', value: 2, enqueuedAt: '', attempts: 0 }
    ];
    const removed: string[] = [];
    const patchFn = vi
      .fn()
      .mockResolvedValueOnce('saved')
      .mockResolvedValueOnce('rejected');

    const flushed = await flushEntries('a1', queued, patchFn, async (_a, itemId) => {
      removed.push(itemId);
    });
    expect(flushed).toBe(1);
    expect(removed).toEqual(['i1', 'i2']);
  });
});
