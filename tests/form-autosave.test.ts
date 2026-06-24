import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTOSAVE_DEBOUNCE_MS, createAutosave } from '../src/lib/client/form/autosave';

describe('form autosave', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('debounces text fields ~600ms', () => {
    vi.useFakeTimers();
    expect(AUTOSAVE_DEBOUNCE_MS).toBeGreaterThanOrEqual(500);
    expect(AUTOSAVE_DEBOUNCE_MS).toBeLessThanOrEqual(800);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} })
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: true });

    const { scheduleSave } = createAutosave('audit-1');
    scheduleSave('item-1', 'text', { value: 'a' });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(599);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('flushPending runs debounced save immediately', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} })
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: true });

    const { scheduleSave, flushPending } = createAutosave('audit-1');
    scheduleSave('item-1', 'text', { value: 'a' });
    expect(fetchMock).not.toHaveBeenCalled();
    await flushPending();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('saves tri immediately', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} })
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: true });

    const { scheduleSave } = createAutosave('audit-1');
    scheduleSave('item-2', 'tri', { value: 'si' });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
