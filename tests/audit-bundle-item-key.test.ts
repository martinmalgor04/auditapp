import { describe, expect, it } from 'vitest';
import { itemKeyString, resolveItemKey } from '../src/lib/server/bundle/item-key';

describe('item-key', () => {
  it('produce la misma key para el mismo ítem en origen y destino', () => {
    const origin = { section_code: 'RED', field_type: 'tri', sort_order: 1, label: '¿Firewall?' };
    const dest = { section_code: 'RED', field_type: 'tri', sort_order: 1, label: '¿Firewall?' };
    expect(itemKeyString(resolveItemKey(origin))).toBe(itemKeyString(resolveItemKey(dest)));
  });

  it('dos ítems de la misma sección con distinto sort_order producen keys distintas', () => {
    const a = resolveItemKey({ section_code: 'RED', field_type: 'tri', sort_order: 1, label: 'X' });
    const b = resolveItemKey({ section_code: 'RED', field_type: 'tri', sort_order: 2, label: 'X' });
    expect(itemKeyString(a)).not.toBe(itemKeyString(b));
  });

  it('detecta drift: mismo sort_order pero distinto field_type → key distinta', () => {
    const a = resolveItemKey({ section_code: 'RED', field_type: 'tri', sort_order: 1, label: 'X' });
    const b = resolveItemKey({ section_code: 'RED', field_type: 'text', sort_order: 1, label: 'X' });
    expect(itemKeyString(a)).not.toBe(itemKeyString(b));
  });

  it('un índice de destino mapea cada key a exactamente un id', () => {
    const items = [
      { id: 'id-1', section_code: 'RED', field_type: 'tri', sort_order: 1, label: 'A' },
      { id: 'id-2', section_code: 'RED', field_type: 'text', sort_order: 2, label: 'B' },
      { id: 'id-3', section_code: 'SRV', field_type: 'tri', sort_order: 1, label: 'A' }
    ];
    const index = new Map(items.map((i) => [itemKeyString(resolveItemKey(i)), i.id]));
    expect(index.size).toBe(3);
    const lookup = itemKeyString({
      section_code: 'SRV',
      field_type: 'tri',
      sort_order: 1,
      label: 'A'
    });
    expect(index.get(lookup)).toBe('id-3');
  });
});
