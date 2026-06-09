import { describe, expect, it, vi } from 'vitest';
import {
  _resetMemoryQueueForTests,
  enqueueSaveMemory,
  listQueuedMemory
} from '../src/lib/client/form/retry-queue';

describe('form retry queue', () => {
  it('accumulates offline changes and flushes one upsert per item', async () => {
    _resetMemoryQueueForTests();
    const auditId = '00000000-0000-4000-8000-000000000001';

    await enqueueSaveMemory({
      auditId,
      itemId: 'item-1',
      value: 'a',
      enqueuedAt: new Date().toISOString(),
      attempts: 0
    });
    await enqueueSaveMemory({
      auditId,
      itemId: 'item-2',
      value: 'b',
      enqueuedAt: new Date().toISOString(),
      attempts: 0
    });
    await enqueueSaveMemory({
      auditId,
      itemId: 'item-3',
      value: 'c',
      enqueuedAt: new Date().toISOString(),
      attempts: 0
    });

    expect(listQueuedMemory(auditId)).toHaveLength(3);

    const patchFn = vi.fn().mockResolvedValue(true);
    const entries = listQueuedMemory(auditId);
    for (const e of entries) {
      await patchFn({ itemId: e.itemId, value: e.value });
    }
    expect(patchFn).toHaveBeenCalledTimes(3);
  });
});
