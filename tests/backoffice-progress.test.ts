import { describe, expect, it } from 'vitest';
import { computeAuditProgress, isItemCompleted } from '../src/lib/server/backoffice/progress';

describe('backoffice progress', () => {
  const items = [
    { id: 'a', field_type: 'text' },
    { id: 'b', field_type: 'text' },
    { id: 'c', field_type: 'number' }
  ];

  it('na counts as completed; empty response does not', () => {
    expect(isItemCompleted('text', '', false)).toBe(false);
    expect(isItemCompleted('text', 'valor', false)).toBe(true);
    expect(isItemCompleted('text', null, true)).toBe(true);

    const progress = computeAuditProgress(items, [
      { item_id: 'a', value: 'ok', na: false },
      { item_id: 'b', value: '', na: false },
      { item_id: 'c', value: null, na: true }
    ]);

    expect(progress.completed).toBe(2);
    expect(progress.total).toBe(3);
    expect(progress.percent).toBe(67);
  });

  it('returns zero percent when no items', () => {
    expect(computeAuditProgress([], [])).toEqual({
      completed: 0,
      total: 0,
      percent: 0
    });
  });
});
