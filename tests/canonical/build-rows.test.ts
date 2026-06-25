import { describe, expect, it } from 'vitest';
import { buildItemRows } from '../../src/lib/server/canonical/build';

const PHOTO_A = '11111111-1111-1111-1111-111111111111';
const PHOTO_B = '33333333-3333-3333-3333-333333333333';
const ORPHAN = '22222222-2222-2222-2222-222222222222';

const photoKeyById = new Map<string, string>([
  [PHOTO_A, 'audits/x/A1/eq-a.jpg'],
  [PHOTO_B, 'audits/x/A1/eq-b.jpg']
]);

describe('buildItemRows (#45 R1, R2, R4)', () => {
  it('resuelve attachment_ids a r2_key y omite UUID huérfanos (R2)', () => {
    const rows = buildItemRows(
      {
        rows: [
          { row_id: 'r-1', cells: { tipo: 'Notebook', anio: 2018 }, attachment_ids: [PHOTO_A, ORPHAN] },
          { row_id: 'r-2', cells: { tipo: 'Servidor' }, attachment_ids: [PHOTO_B] }
        ]
      },
      photoKeyById
    );
    expect(rows).toHaveLength(2);
    expect(rows![0].attachments).toEqual(['audits/x/A1/eq-a.jpg']);
    expect(rows![0].cells).toMatchObject({ tipo: 'Notebook', anio: 2018 });
    expect(rows![1].attachments).toEqual(['audits/x/A1/eq-b.jpg']);
  });

  it('fila sin attachment_ids → attachments vacío, nunca null (R4)', () => {
    const rows = buildItemRows(
      { rows: [{ row_id: 'r-1', cells: { tipo: 'PC' } }] },
      photoKeyById
    );
    expect(rows![0].attachments).toEqual([]);
  });

  it('value sin rows → arreglo vacío (R4)', () => {
    expect(buildItemRows(null, photoKeyById)).toEqual([]);
    expect(buildItemRows({}, photoKeyById)).toEqual([]);
    expect(buildItemRows({ rows: [] }, photoKeyById)).toEqual([]);
  });

  it('genera row_id sintético cuando falta', () => {
    const rows = buildItemRows({ rows: [{ cells: { tipo: 'PC' } }] }, photoKeyById);
    expect(rows![0].row_id).toBe('row-0');
  });
});
