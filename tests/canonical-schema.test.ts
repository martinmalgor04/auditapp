import { describe, expect, it } from 'vitest';
import { CANONICAL_SCHEMA_VERSION } from '../src/lib/server/canonical/version';
import { canonicalAuditSchema, canonicalItemRowSchema } from '../src/lib/server/canonical/schema';
import golden from './fixtures/canonical-audit-golden.json';

describe('canonical schema', () => {
  it('CANONICAL_SCHEMA_VERSION is 1.2 (#45: campo opcional rows)', () => {
    expect(CANONICAL_SCHEMA_VERSION).toBe('1.2');
  });

  it('schema version field is semver string', () => {
    expect(CANONICAL_SCHEMA_VERSION).toMatch(/^\d+\.\d+$/);
  });

  it('schema accepts golden fixture', () => {
    const parsed = canonicalAuditSchema.parse(golden);
    expect(parsed.schema_version).toBe('1.2');
  });

  it('schema rejects invalid payload', () => {
    expect(() =>
      canonicalAuditSchema.parse({
        ...golden,
        schema_version: '2.0',
        indices: { it: 150 }
      })
    ).toThrow();
  });

  // #45 (R1, R3, R4) — campo opcional `rows` en ítems table.
  it('payload legacy sin rows sigue validando (R3)', () => {
    const parsed = canonicalAuditSchema.parse(golden);
    // El golden no trae `rows`: los ítems table validan igual.
    const tableItems = parsed.sections.flatMap((s) =>
      s.items.filter((i) => i.field_type === 'table')
    );
    expect(tableItems.every((i) => i.rows === undefined)).toBe(true);
  });

  it('schema acepta un ítem table con rows (row_id, cells, attachments) (R1, R4)', () => {
    const withRows = {
      ...golden,
      sections: golden.sections.map((s, idx) =>
        idx === 0
          ? {
              ...s,
              items: s.items.map((i) =>
                i.field_type === 'table'
                  ? {
                      ...i,
                      rows: [
                        {
                          row_id: 'r-1',
                          cells: { tipo: 'Notebook', anio: 2018 },
                          attachments: ['audits/x/photo-1.jpg']
                        },
                        // R4: filas sin fotos → attachments vacío.
                        { row_id: 'r-2', cells: { tipo: 'Servidor' }, attachments: [] }
                      ]
                    }
                  : i
              )
            }
          : s
      )
    };
    const parsed = canonicalAuditSchema.parse(withRows);
    const tableItem = parsed.sections[0].items.find((i) => i.field_type === 'table');
    expect(tableItem?.rows?.length).toBe(2);
    expect(tableItem?.rows?.[0].attachments).toEqual(['audits/x/photo-1.jpg']);
    expect(tableItem?.rows?.[1].attachments).toEqual([]);
  });

  it('rechaza row sin row_id', () => {
    expect(() =>
      canonicalItemRowSchema.parse({ cells: {}, attachments: [] })
    ).toThrow();
  });
});
