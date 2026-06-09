import { describe, expect, it } from 'vitest';
import { scoreInventoryRow, scoreInventoryTable } from '../../src/lib/server/scoring/inventory-eol';

const ref = new Date('2026-06-15');

describe('inventory eol', () => {
  it('eol status and age fallback produce deterministic row scores', () => {
    expect(scoreInventoryRow({ estado_eol: 'vigente' }, ref)).toEqual({
      points: 100,
      rule: 'eol:vigente→100'
    });
    expect(scoreInventoryRow({ estado_eol: 'extendido' }, ref)).toEqual({
      points: 50,
      rule: 'eol:extendido→50'
    });
    expect(scoreInventoryRow({ estado_eol: 'eol' }, ref)).toEqual({
      points: 0,
      rule: 'eol:eol→0'
    });

    expect(scoreInventoryRow({ tipo: 'notebook', antiguedad: 2 }, ref).points).toBe(100);
    expect(scoreInventoryRow({ tipo: 'notebook', antiguedad: 4 }, ref).points).toBe(50);
    expect(scoreInventoryRow({ tipo: 'notebook', antiguedad: 7 }, ref).points).toBe(0);

    expect(scoreInventoryRow({ tipo: 'servidor', antiguedad: 3 }, ref).points).toBe(100);
    expect(scoreInventoryRow({ tipo: 'servidor', antiguedad: 5 }, ref).points).toBe(50);
    expect(scoreInventoryRow({ tipo: 'servidor', antiguedad: 8 }, ref).points).toBe(0);

    const table = scoreInventoryTable(
      [{ estado_eol: 'vigente' }, { estado_eol: 'eol' }],
      ref
    );
    expect(table.points).toBe(50);
  });
});
