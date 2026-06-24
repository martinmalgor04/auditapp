import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBriefingAutosave } from '../src/lib/client/briefing/autosave';

describe('briefing autosave', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('flushPending persists debounced text before step change', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const { scheduleSave, flushPending } = createBriefingAutosave('token-1');
    scheduleSave('item-1', 'draft', 'text');
    expect(fetchMock).not.toHaveBeenCalled();
    await flushPending();
    expect(fetchMock).toHaveBeenCalledWith('/api/briefing/token-1/responses', expect.any(Object));
    vi.useRealTimers();
  });
});
