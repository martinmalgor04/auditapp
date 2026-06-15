import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../src/lib/server/clients/parse';
import { planClientImport } from '../src/lib/server/clients/import';
import { CANONICAL_FIELDS } from '../src/lib/server/clients/normalize';

const TEMPLATE_PATH = join(process.cwd(), 'static', 'plantillas', 'clientes-import-template.csv');

describe('clients import template (R20, R21)', () => {
  const content = readFileSync(TEMPLATE_PATH, 'utf8');

  it('tiene exactamente los encabezados canónicos y ≥1 fila de ejemplo (R20)', () => {
    const lines = content.trim().split(/\r?\n/);
    const headers = lines[0].split(',').map((h) => h.trim());
    expect(headers).toEqual([...CANONICAL_FIELDS]);
    expect(lines.length).toBeGreaterThanOrEqual(2); // encabezado + ≥1 fila
  });

  it('importar la plantilla no produce filas inválidas por encabezado/columna (R21)', () => {
    const rows = parseCsv(content);
    const planHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];
    const plan = planClientImport(rows, planHeaders);
    expect(plan.invalid).toEqual([]);
    expect(plan.ignoredColumns).toEqual([]);
    expect(plan.valid.length).toBeGreaterThanOrEqual(1);
    // cada fila ejemplo es deduplicable (tiene CUIT)
    expect(plan.skipped).toEqual([]);
  });
});
