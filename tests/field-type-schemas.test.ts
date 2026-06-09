import { describe, expect, it } from 'vitest';
import {
  FIELD_TYPES,
  optionsSchemaFor,
  valueSchemaFor,
  validateOptions
} from '../src/lib/server/db/field-schemas';

describe('field type schemas', () => {
  it('validates options fixtures for each type', () => {
    const fixtures: Array<{ type: (typeof FIELD_TYPES)[number]; options: unknown }> = [
      { type: 'text', options: { max_length: 500 } },
      { type: 'number', options: { unit: 'días', thresholds: [{ min: 0, max: 7, score: 100 }] } },
      { type: 'bool', options: {} },
      { type: 'tri', options: {} },
      {
        type: 'select',
        options: { choices: ['A', 'B'], score_map: { A: 100, B: 0 } }
      },
      {
        type: 'multiselect',
        options: { choices: ['X', 'Y'], score_map: { X: 50, Y: 100 } }
      },
      { type: 'date', options: {} },
      { type: 'datetime', options: {} },
      { type: 'list', options: { max_items: 5 } },
      {
        type: 'table',
        options: {
          columns: [{ key: 'name', label: 'Nombre', type: 'text' }],
          eol_rules: { vigente: 100, extendido: 50, eol: 0 }
        }
      },
      { type: 'file_ref', options: { max_files: 2 } },
      {
        type: 'money',
        options: {
          currency: 'ARS',
          thresholds: [{ min: 0, max: 1000, score: 100 }]
        }
      }
    ];

    for (const { type, options } of fixtures) {
      const result = validateOptions(type, options, true);
      expect(result.success, `expected ${type} options to be valid`).toBe(true);
      expect(optionsSchemaFor(type).safeParse(options).success).toBe(true);
    }
  });

  it('rejects invalid options shapes', () => {
    expect(validateOptions('select', { choices: [] }, true).success).toBe(false);
    expect(validateOptions('select', { choices: ['A'] }, true).success).toBe(false);
    expect(validateOptions('table', { columns: [] }, true).success).toBe(false);
    expect(
      validateOptions(
        'select',
        { choices: ['A', 'B'], score_map: { A: 75 } },
        true
      ).success
    ).toBe(false);
  });

  it('upserts valid value per field_type', () => {
    const selectOptions = { choices: ['WPA2', 'WPA3'], score_map: { WPA2: 50, WPA3: 100 } };

    const validValues: Array<{ type: (typeof FIELD_TYPES)[number]; value: unknown; options?: unknown }> =
      [
        { type: 'text', value: 'hola' },
        { type: 'number', value: 42 },
        { type: 'bool', value: true },
        { type: 'tri', value: 'parcial' },
        { type: 'select', value: 'WPA3', options: selectOptions },
        { type: 'multiselect', value: ['X'], options: { choices: ['X', 'Y'] } },
        { type: 'date', value: '2026-06-08' },
        { type: 'datetime', value: '2026-06-08T12:00:00.000Z' },
        { type: 'list', value: ['riesgo 1'] },
        {
          type: 'table',
          value: [{ name: 'srv-01' }],
          options: { columns: [{ key: 'name', label: 'Nombre', type: 'text' }] }
        },
        { type: 'file_ref', value: '550e8400-e29b-41d4-a716-446655440000' },
        { type: 'money', value: 1500 }
      ];

    for (const { type, value, options } of validValues) {
      const schema = valueSchemaFor(type, options);
      expect(schema.safeParse(value).success, `expected valid value for ${type}`).toBe(true);
    }
  });

  it('rejects incompatible value shape', () => {
    expect(valueSchemaFor('text').safeParse(123).success).toBe(false);
    expect(valueSchemaFor('bool').safeParse('si').success).toBe(false);
    expect(valueSchemaFor('tri').safeParse('maybe').success).toBe(false);
    expect(valueSchemaFor('date').safeParse('08-06-2026').success).toBe(false);
    expect(
      valueSchemaFor('select', { choices: ['A', 'B'] }).safeParse('C').success
    ).toBe(false);
  });
});
