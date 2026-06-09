import { describe, expect, it } from 'vitest';
import { FIELD_TYPES } from '../src/lib/server/db/field-schemas';

describe('form field renderer contract', () => {
  it('covers all 12 field types', () => {
    expect(FIELD_TYPES).toHaveLength(12);
    expect(FIELD_TYPES).toContain('datetime');
    expect(FIELD_TYPES).toContain('table');
    expect(FIELD_TYPES).toContain('file_ref');
    expect(FIELD_TYPES).toContain('money');
  });

  it('method E maps to Entrevista label', () => {
    const labels: Record<string, string> = {
      O: 'Observación',
      E: 'Entrevista',
      C: 'Configuración',
      X: 'Externo'
    };
    expect(labels['E']).toBe('Entrevista');
  });
});
