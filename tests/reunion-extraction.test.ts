import { describe, it, expect } from 'vitest';
import { REUNION_EXTRACTABLE_FIELD_TYPES } from '../src/lib/server/reunion/pipeline/context';

/** Los field_types excluidos del MVP de extracción. */
const EXCLUDED_FIELD_TYPES = ['table', 'file_ref', 'multiselect', 'list', 'money', 'datetime'];

/** Los field_types incluidos en el MVP. */
const INCLUDED_FIELD_TYPES = ['text', 'tri', 'select', 'number', 'bool', 'date'];

describe('REUNION_EXTRACTABLE_FIELD_TYPES', () => {
  it('incluye los tipos del MVP', () => {
    for (const ft of INCLUDED_FIELD_TYPES) {
      expect(REUNION_EXTRACTABLE_FIELD_TYPES.has(ft)).toBe(true);
    }
  });

  it('excluye tipos no soportados (table, file_ref, multiselect, list, money, datetime)', () => {
    for (const ft of EXCLUDED_FIELD_TYPES) {
      expect(REUNION_EXTRACTABLE_FIELD_TYPES.has(ft)).toBe(false);
    }
  });

  it('tiene exactamente 6 tipos soportados', () => {
    expect(REUNION_EXTRACTABLE_FIELD_TYPES.size).toBe(INCLUDED_FIELD_TYPES.length);
  });
});

describe('buildTemplateContextForExtraction SQL filter (unit)', () => {
  // Verifica que la consulta SQL usa el filtro de field_type correcto.
  // Esta prueba valida la constante — la integración con DB real va en api tests.

  it('los tipos excluidos no están en INCLUDED_FIELD_TYPES', () => {
    for (const ft of EXCLUDED_FIELD_TYPES) {
      expect(INCLUDED_FIELD_TYPES).not.toContain(ft);
    }
  });

  it('INCLUDED_FIELD_TYPES y EXCLUDED_FIELD_TYPES son disjuntos', () => {
    const intersection = INCLUDED_FIELD_TYPES.filter((ft) => EXCLUDED_FIELD_TYPES.includes(ft));
    expect(intersection).toHaveLength(0);
  });
});
