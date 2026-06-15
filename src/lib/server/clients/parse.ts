import { parse } from 'csv-parse/sync';
import xlsx from 'node-xlsx';
import { UnsupportedFormatError } from './errors';

/** Fila cruda: encabezados (tal cual aparecen) como claves, celdas como string. */
export type RawRow = Record<string, string>;

/** CSV -> filas con encabezados como claves (csv-parse/sync, igual que el seed). */
export function parseCsv(content: string): RawRow[] {
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: false
  }) as RawRow[];
}

/**
 * .xlsx (primera hoja) -> filas con encabezados como claves (node-xlsx, SÍNCRONO).
 * Deriva encabezados de data[0], zippea con data.slice(1), celdas -> string.
 * Descarta filas totalmente vacías.
 */
export function parseXlsx(buffer: Buffer): RawRow[] {
  const sheets = xlsx.parse(buffer);
  const sheet = sheets[0];
  if (!sheet || !Array.isArray(sheet.data) || sheet.data.length === 0) {
    return [];
  }

  const data = sheet.data as unknown[][];
  const headerRow = data[0] ?? [];
  const headers = headerRow.map((cell) => cellToString(cell));

  const rows: RawRow[] = [];
  for (const cells of data.slice(1)) {
    if (!Array.isArray(cells)) {
      continue;
    }
    const values = headers.map((_, i) => cellToString(cells[i]));
    if (values.every((v) => v.trim() === '')) {
      continue; // fila totalmente vacía
    }
    const row: RawRow = {};
    headers.forEach((header, i) => {
      row[header] = values[i];
    });
    rows.push(row);
  }
  return rows;
}

function cellToString(cell: unknown): string {
  return cell === null || cell === undefined ? '' : String(cell);
}

/** Despacha por extensión / content-type. Lanza UnsupportedFormatError si no aplica (R4). */
export function detectFormat(filename: string, contentType: string): 'csv' | 'xlsx' {
  const name = filename.toLowerCase();
  const type = contentType.toLowerCase();

  if (name.endsWith('.csv') || type === 'text/csv') {
    return 'csv';
  }
  if (
    name.endsWith('.xlsx') ||
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'xlsx';
  }
  throw new UnsupportedFormatError();
}
