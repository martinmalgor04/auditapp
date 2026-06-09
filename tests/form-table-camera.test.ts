import { describe, expect, it } from 'vitest';

describe('form table camera', () => {
  it('appends attachment to row_id not general', () => {
    const rowId = 'row-abc';
    const attachmentId = 'att-123';
    const value = {
      rows: [
        { row_id: rowId, cells: { tipo: 'PC' }, attachment_ids: [] as string[] },
        { row_id: 'row-other', cells: { tipo: 'NB' }, attachment_ids: [] as string[] }
      ]
    };

    value.rows = value.rows.map((r) =>
      r.row_id === rowId ? { ...r, attachment_ids: [...r.attachment_ids, attachmentId] } : r
    );

    expect(value.rows[0].attachment_ids).toEqual([attachmentId]);
    expect(value.rows[1].attachment_ids).toEqual([]);
  });
});
