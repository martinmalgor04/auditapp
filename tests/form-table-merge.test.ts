import { describe, expect, it } from 'vitest';
import { mergeTableAttachmentIds } from '../src/lib/server/form/merge-table';

const existing = {
  rows: [
    { row_id: 'r1', cells: { tipo: 'PC' }, attachment_ids: ['att-1'] },
    { row_id: 'r2', cells: { tipo: 'NB' }, attachment_ids: [] }
  ]
};

describe('mergeTableAttachmentIds (red de seguridad server-side)', () => {
  it('un payload con estado viejo no des-asocia fotos de filas conservadas', () => {
    const incoming = {
      rows: [
        { row_id: 'r1', cells: { tipo: 'PC actualizada' }, attachment_ids: [] },
        { row_id: 'r2', cells: { tipo: 'NB' }, attachment_ids: ['att-2'] }
      ]
    };
    const merged = mergeTableAttachmentIds(existing, incoming) as typeof incoming;
    expect(merged.rows[0].attachment_ids).toEqual(['att-1']);
    expect(merged.rows[0].cells.tipo).toBe('PC actualizada');
    expect(merged.rows[1].attachment_ids).toEqual(['att-2']);
  });

  it('hace unión sin duplicados', () => {
    const incoming = {
      rows: [{ row_id: 'r1', cells: {}, attachment_ids: ['att-1', 'att-9'] }]
    };
    const merged = mergeTableAttachmentIds(existing, incoming) as typeof incoming;
    expect(merged.rows[0].attachment_ids).toEqual(['att-1', 'att-9']);
  });

  it('permite el caso legítimo de borrar filas (no las resucita)', () => {
    const incoming = { rows: [{ row_id: 'r2', cells: { tipo: 'NB' }, attachment_ids: [] }] };
    const merged = mergeTableAttachmentIds(existing, incoming) as typeof incoming;
    expect(merged.rows).toHaveLength(1);
    expect(merged.rows[0].row_id).toBe('r2');
  });

  it('pasa through valores no-tabla o sin estado previo', () => {
    expect(mergeTableAttachmentIds(null, { rows: [] })).toEqual({ rows: [] });
    expect(mergeTableAttachmentIds(existing, 'x')).toBe('x');
  });
});
