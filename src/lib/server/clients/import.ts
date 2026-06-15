import { normalizeRow, inspectHeaders } from './normalize';
import { clientImportRowSchema, type ClientImportRow } from './schema';
import type { RawRow } from './parse';

export type RowError = { row: number; reason: string };

export type ImportPlan = {
  total: number; // filas de datos leídas
  valid: ClientImportRow[]; // listas para upsert (dedupe por CUIT, última gana)
  skipped: RowError[]; // válidas SIN CUIT -> no deduplicables (R9.bis)
  invalid: RowError[]; // fallaron Zod (razon_social / formato CUIT)
  ignoredColumns: string[]; // encabezados no canónicos descartados (R5.ter)
};

/**
 * Parsea+normaliza+valida; NO toca DB. Numera filas 1-based sobre datos.
 * Recibe también los encabezados crudos para poblar ignoredColumns (R5.ter).
 */
export function planClientImport(rows: RawRow[], headers: string[]): ImportPlan {
  const ignoredColumns = inspectHeaders(headers).ignored;
  const skipped: RowError[] = [];
  const invalid: RowError[] = [];

  // Dedupe por CUIT: la última fila válida con el mismo CUIT gana (R16).
  const byCuit = new Map<string, ClientImportRow>();

  rows.forEach((raw, index) => {
    const rowNumber = index + 1; // 1-based sobre datos
    const normalized = normalizeRow(raw);
    const parsed = clientImportRowSchema.safeParse(normalized);

    if (!parsed.success) {
      invalid.push({
        row: rowNumber,
        reason: parsed.error.issues.map((i) => i.message).join('; ')
      });
      return;
    }

    if (parsed.data.cuit === null) {
      skipped.push({ row: rowNumber, reason: 'sin CUIT, no deduplicable' });
      return;
    }

    byCuit.set(parsed.data.cuit, parsed.data);
  });

  return {
    total: rows.length,
    valid: [...byCuit.values()],
    skipped,
    invalid,
    ignoredColumns
  };
}
