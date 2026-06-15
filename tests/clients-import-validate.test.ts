import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/lib/server/clients/parse';
import { planClientImport } from '../src/lib/server/clients/import';

function plan(csv: string) {
  const rows = parseCsv(csv);
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return planClientImport(rows, headers);
}

describe('clients import validate (R8, R9, R9.bis, R13)', () => {
  it('fila sin razon_social -> inválida con fila y motivo, no aborta el lote (R8)', () => {
    const p = plan(
      'razon_social,cuit\n' +
        ',30-12345678-9\n' + // fila 1: sin razon social -> inválida
        'ACME SA,30-87654321-0\n' // fila 2: válida
    );
    expect(p.invalid).toHaveLength(1);
    expect(p.invalid[0].row).toBe(1);
    expect(p.invalid[0].reason).toContain('razon_social');
    expect(p.valid).toHaveLength(1);
    expect(p.valid[0].razon_social).toBe('ACME SA');
  });

  it('CUIT no-11-dígitos -> inválida, el resto sigue (R9)', () => {
    const p = plan(
      'razon_social,cuit\n' +
        'Beta SRL,123\n' + // fila 1: cuit corto -> inválida
        'Gamma SA,30-12345678-9\n' // fila 2: válida
    );
    expect(p.invalid).toHaveLength(1);
    expect(p.invalid[0].row).toBe(1);
    expect(p.invalid[0].reason).toContain('11 dígitos');
    expect(p.valid).toHaveLength(1);
    expect(p.valid[0].cuit).toBe('30123456789');
  });

  it('válida sin CUIT -> skipped (no inválida, no creada) (R9.bis, R13)', () => {
    const p = plan(
      'razon_social,cuit\n' +
        'Sin Cuit SA,\n' + // fila 1: válida pero sin cuit -> skipped
        'Con Cuit SA,30-12345678-9\n' // fila 2: válida
    );
    expect(p.skipped).toHaveLength(1);
    expect(p.skipped[0].row).toBe(1);
    expect(p.skipped[0].reason).toBe('sin CUIT, no deduplicable');
    expect(p.invalid).toHaveLength(0);
    expect(p.valid).toHaveLength(1);
    expect(p.valid[0].razon_social).toBe('Con Cuit SA');
  });

  it('reporta total, categorías separadas skipped/invalid (R13)', () => {
    const p = plan(
      'razon_social,cuit\n' +
        ',30-12345678-9\n' + // inválida (1)
        'Sin Cuit,\n' + // skipped (2)
        'Buena SA,30-87654321-0\n' // válida (3)
    );
    expect(p.total).toBe(3);
    expect(p.invalid).toHaveLength(1);
    expect(p.skipped).toHaveLength(1);
    expect(p.valid).toHaveLength(1);
  });

  it('dos filas mismo CUIT -> consolida (última gana) (R16)', () => {
    const p = plan(
      'razon_social,cuit\n' +
        'Primera SA,30-12345678-9\n' +
        'Segunda SA,30-12345678-9\n'
    );
    expect(p.valid).toHaveLength(1);
    expect(p.valid[0].razon_social).toBe('Segunda SA');
  });
});
