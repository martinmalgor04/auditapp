import { describe, expect, it } from 'vitest';
import xlsx from 'node-xlsx';
import { parseCsv, parseXlsx, detectFormat } from '../src/lib/server/clients/parse';
import { planClientImport } from '../src/lib/server/clients/import';
import { normalizeRow, inspectHeaders } from '../src/lib/server/clients/normalize';
import { normalizeCuit } from '../src/lib/server/clients/schema';
import { UnsupportedFormatError } from '../src/lib/server/clients/errors';

const HEADERS = ['razon_social', 'numero_doc', 'direccion', 'cp', 'provincia', 'telefono', 'email'];
const ROW1 = ['ACME SA', '30-12345678-9', 'Calle 1', '3500', 'Chaco', '362-1111', 'a@acme.com'];
const ROW2 = ['Beta SRL', '30-87654321-0', '', '', 'Corrientes', '', 'b@beta.com'];

function buildCsv(rows: string[][]): string {
  return [HEADERS, ...rows].map((r) => r.join(',')).join('\n') + '\n';
}

function buildXlsxBuffer(rows: string[][]): Buffer {
  return xlsx.build([{ name: 'Hoja1', data: [HEADERS, ...rows], options: {} }]);
}

describe('clients import parse (R3, R5, R5.bis, R5.ter, R6, R7)', () => {
  it('CSV y xlsx producen las mismas filas normalizadas (R3)', () => {
    const csvRows = parseCsv(buildCsv([ROW1, ROW2])).map(normalizeRow);
    const xlsxRows = parseXlsx(buildXlsxBuffer([ROW1, ROW2])).map(normalizeRow);
    expect(xlsxRows).toEqual(csvRows);
    expect(csvRows).toHaveLength(2);
  });

  it('alias numero_doc -> cuit y razón social -> razon_social (R5.bis)', () => {
    const rows = parseCsv(
      'razón social,numero_doc\nGamma SA,20-11111111-2\n'
    ).map(normalizeRow);
    expect(rows[0].razon_social).toBe('Gamma SA');
    expect(rows[0].cuit).toBe('20111111112');
  });

  it('solo set canónico se mapea; id/categoria_iva/timestamps se descartan (R5)', () => {
    const raw = parseCsv(
      'id,razon_social,numero_doc,categoria_iva,created_at,updated_at\n' +
        'uuid-1,Delta SA,30-12345678-9,RI,2020-01-01,2020-01-02\n'
    );
    const normalized = normalizeRow(raw[0]);
    expect(normalized).toEqual({
      razon_social: 'Delta SA',
      cuit: '30123456789',
      direccion: null,
      cp: null,
      provincia: null,
      telefono: null,
      email: null
    });
    // 'categoria_iva' nunca aparece como campo canónico
    expect(Object.keys(normalized)).not.toContain('categoria_iva');
    expect(Object.keys(normalized)).not.toContain('id');
  });

  it('inspectHeaders lista columnas ignoradas y su conteo (R5.ter)', () => {
    const headers = ['id', 'razon_social', 'numero_doc', 'categoria_iva', 'created_at'];
    const { mapped, ignored } = inspectHeaders(headers);
    expect(mapped).toEqual(['razon_social', 'numero_doc']);
    expect(ignored).toEqual(['id', 'categoria_iva', 'created_at']);

    const plan = planClientImport([], headers);
    expect(plan.ignoredColumns).toEqual(['id', 'categoria_iva', 'created_at']);
  });

  it('vacíos -> null en opcionales (R6)', () => {
    const rows = parseCsv(buildCsv([ROW2])).map(normalizeRow);
    expect(rows[0].direccion).toBeNull();
    expect(rows[0].cp).toBeNull();
    expect(rows[0].telefono).toBeNull();
    expect(rows[0].provincia).toBe('Corrientes');
  });

  it('normalizeCuit deja solo dígitos: 30-12345678-9 -> 30123456789 (R7)', () => {
    expect(normalizeCuit('30-12345678-9')).toBe('30123456789');
    expect(normalizeCuit(' 30.123.456.78 9 ')).toBe('30123456789');
    expect(normalizeCuit('')).toBeNull();
    expect(normalizeCuit(null)).toBeNull();
  });

  it('parseXlsx descarta filas totalmente vacías', () => {
    const rows = parseXlsx(buildXlsxBuffer([ROW1, ['', '', '', '', '', '', ''], ROW2]));
    expect(rows).toHaveLength(2);
  });

  it('detectFormat reconoce csv y xlsx, rechaza el resto (R4)', () => {
    expect(detectFormat('clientes.csv', '')).toBe('csv');
    expect(detectFormat('x', 'text/csv')).toBe('csv');
    expect(detectFormat('clientes.xlsx', '')).toBe('xlsx');
    expect(() => detectFormat('clientes.pdf', 'application/pdf')).toThrow(UnsupportedFormatError);
    expect(() => detectFormat('clientes.xls', '')).toThrow(UnsupportedFormatError);
    expect(() => detectFormat('clientes.json', 'application/json')).toThrow(UnsupportedFormatError);
  });
});
