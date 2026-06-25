import { describe, expect, it } from 'vitest';
import {
  resolveInventoryColumns,
  isInventoryTableItem,
  extractColumns,
  type InventoryColumn
} from '../../src/lib/informe/inventory-columns';

const INV_COLUMNS: InventoryColumn[] = [
  { key: 'tipo', label: 'Tipo de equipo', type: 'select' },
  { key: 'modelo', label: 'Modelo', type: 'text' },
  { key: 'anio', label: 'Año de compra', type: 'number' },
  { key: 'estado_eol', label: 'Estado EOL', type: 'select' }
];

describe('inventory-columns (#45 R6, R8, R9)', () => {
  it('mapea columnas tipo/modelo/antigüedad/EOL por key', () => {
    const r = resolveInventoryColumns(INV_COLUMNS);
    expect(r.tipoKey).toBe('tipo');
    expect(r.modeloKey).toBe('modelo');
    expect(r.antiguedadKey).toBe('anio');
    expect(r.eolKey).toBe('estado_eol');
  });

  it('mapea por heurística de label cuando la key no matchea', () => {
    const cols: InventoryColumn[] = [
      { key: 'col_a', label: 'Categoria del activo', type: 'text' },
      { key: 'col_b', label: 'Antiguedad en años', type: 'number' }
    ];
    const r = resolveInventoryColumns(cols);
    expect(r.tipoKey).toBe('col_a');
    expect(r.antiguedadKey).toBe('col_b');
  });

  it('usa columna select como EOL cuando hay eol_rules pero ninguna columna matchea', () => {
    const cols: InventoryColumn[] = [
      { key: 'tipo', label: 'Tipo', type: 'text' },
      { key: 'salud', label: 'Salud del equipo', type: 'select' }
    ];
    const r = resolveInventoryColumns(cols, { vigente: 100, extendido: 50, eol: 0 });
    expect(r.eolKey).toBe('salud');
  });

  it('isInventoryTableItem: true para table IT con tipo + (antigüedad|EOL)', () => {
    const item = { field_type: 'table', options: { columns: INV_COLUMNS } };
    expect(isInventoryTableItem(item, 'it')).toBe(true);
  });

  it('isInventoryTableItem: false en dominio ERP (R9)', () => {
    const item = { field_type: 'table', options: { columns: INV_COLUMNS } };
    expect(isInventoryTableItem(item, 'erp')).toBe(false);
  });

  it('isInventoryTableItem: false para tablas sin tipo ni antigüedad/EOL', () => {
    const item = {
      field_type: 'table',
      options: { columns: [{ key: 'nota', label: 'Nota', type: 'text' }] }
    };
    expect(isInventoryTableItem(item, 'it')).toBe(false);
  });

  it('isInventoryTableItem: false para field_type que no es table', () => {
    expect(isInventoryTableItem({ field_type: 'text', options: {} }, 'it')).toBe(false);
  });

  it('extractColumns ignora opciones malformadas', () => {
    expect(extractColumns(null)).toEqual([]);
    expect(extractColumns({ columns: 'x' })).toEqual([]);
    expect(extractColumns({ columns: [{ key: 'k', label: 'L', type: 'text' }] })).toHaveLength(1);
  });
});
