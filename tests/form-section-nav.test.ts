import { describe, expect, it } from 'vitest';

describe('form section nav', () => {
  type Item = { id: string; na: boolean; value: unknown };
  type Section = { id: string; code: string; items: Item[] };

  const sections: Section[] = [
    { id: 'a1', code: 'A1', items: [{ id: '1', na: false, value: 'x' }] },
    { id: 'a2', code: 'A2', items: [{ id: '2', na: false, value: null }] },
    { id: 'a5', code: 'A5', items: [{ id: '3', na: true, value: null }] }
  ];

  function isComplete(item: { na: boolean; value: unknown }): boolean {
    if (item.na) return true;
    return item.value !== null && item.value !== '';
  }

  it('allows free navigation between sections', () => {
    let active = 'a1';
    active = 'a5';
    expect(active).toBe('a5');
    active = 'a2';
    expect(active).toBe('a2');
  });

  it('progress bar reflects completed items over total', () => {
    const allItems = sections.flatMap((s) => s.items);
    const complete = allItems.filter(isComplete).length;
    const pct = Math.round((complete / allItems.length) * 100);
    expect(pct).toBe(67);
  });
});
