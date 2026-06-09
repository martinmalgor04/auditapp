import { z } from 'zod';

export const FIELD_TYPES = [
  'text',
  'number',
  'bool',
  'tri',
  'select',
  'multiselect',
  'date',
  'datetime',
  'list',
  'table',
  'file_ref',
  'money'
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

const SCORE_VALUE = z.union([z.literal(0), z.literal(50), z.literal(100)]);

const thresholdSchema = z.object({
  min: z.number(),
  max: z.number(),
  score: SCORE_VALUE
});

const columnSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'number', 'date', 'select'])
});

const eolRulesSchema = z.object({
  vigente: SCORE_VALUE,
  extendido: SCORE_VALUE,
  eol: SCORE_VALUE
});

const textOptionsSchema = z.object({
  max_length: z.number().int().positive().optional()
});

const numberOptionsSchema = z.object({
  unit: z.string().optional(),
  thresholds: z.array(thresholdSchema).optional()
});

const boolOptionsSchema = z.object({});

const triOptionsSchema = z.object({});

const selectOptionsSchema = z.object({
  choices: z.array(z.string().min(1)),
  score_map: z.record(SCORE_VALUE).optional()
});

const multiselectOptionsSchema = z.object({
  choices: z.array(z.string().min(1)),
  score_map: z.record(SCORE_VALUE).optional()
});

const dateOptionsSchema = z.object({});
const datetimeOptionsSchema = z.object({});
const listOptionsSchema = z.object({
  max_items: z.number().int().positive().optional()
});

const tableOptionsSchema = z.object({
  columns: z.array(columnSchema).min(1),
  eol_rules: eolRulesSchema.optional()
});

const fileRefOptionsSchema = z.object({
  max_files: z.number().int().positive().optional()
});

const moneyOptionsSchema = z.object({
  currency: z.literal('ARS').optional(),
  thresholds: z.array(thresholdSchema).optional()
});

const OPTIONS_SCHEMAS: Record<FieldType, z.ZodType> = {
  text: textOptionsSchema,
  number: numberOptionsSchema,
  bool: boolOptionsSchema,
  tri: triOptionsSchema,
  select: selectOptionsSchema,
  multiselect: multiselectOptionsSchema,
  date: dateOptionsSchema,
  datetime: datetimeOptionsSchema,
  list: listOptionsSchema,
  table: tableOptionsSchema,
  file_ref: fileRefOptionsSchema,
  money: moneyOptionsSchema
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function optionsSchemaFor(fieldType: FieldType): z.ZodType {
  return OPTIONS_SCHEMAS[fieldType];
}

export function valueSchemaFor(fieldType: FieldType, options?: unknown): z.ZodType {
  switch (fieldType) {
    case 'text':
      return z.string();
    case 'number':
    case 'money':
      return z.number();
    case 'bool':
      return z.boolean();
    case 'tri':
      return z.enum(['si', 'no', 'parcial']);
    case 'select': {
      const parsed = selectOptionsSchema.parse(options ?? {});
      return z.enum(parsed.choices as [string, ...string[]]);
    }
    case 'multiselect': {
      const parsed = multiselectOptionsSchema.parse(options ?? {});
      const choiceSet = new Set(parsed.choices);
      return z.array(z.string()).refine(
        (vals) => vals.every((v) => choiceSet.has(v)),
        'multiselect values must be subset of choices'
      );
    }
    case 'date':
      return z.string().regex(isoDate, 'expected YYYY-MM-DD');
    case 'datetime':
      return z.string().datetime();
    case 'list':
      return z.array(z.string());
    case 'table': {
      const parsed = tableOptionsSchema.parse(options ?? {});
      const keys = parsed.columns.map((c) => c.key);
      const rowSchema = z.record(z.unknown()).refine(
        (row) => keys.every((k) => k in row),
        'table row must include all column keys'
      );
      return z.array(rowSchema);
    }
    case 'file_ref':
      return z.union([z.string().uuid(), z.array(z.string().uuid())]);
    default:
      return z.never();
  }
}

/** Valida options con reglas de scoring cuando scores=true. */
export function validateOptions(
  fieldType: FieldType,
  options: unknown,
  scores = true
): z.SafeParseReturnType<unknown, unknown> {
  const base = optionsSchemaFor(fieldType).safeParse(options ?? {});
  if (!base.success || !scores) {
    return base;
  }

  const opts = base.data as Record<string, unknown>;

  if (fieldType === 'select' || fieldType === 'multiselect') {
    const scoreMap = opts.score_map as Record<string, number> | undefined;
    if (!scoreMap || Object.keys(scoreMap).length === 0) {
      return {
        success: false,
        error: new z.ZodError([
          {
            code: 'custom',
            path: ['score_map'],
            message: 'score_map required when scores=true'
          }
        ])
      };
    }
    for (const v of Object.values(scoreMap)) {
      if (v !== 0 && v !== 50 && v !== 100) {
        return {
          success: false,
          error: new z.ZodError([
            {
              code: 'custom',
              path: ['score_map'],
              message: 'score_map values must be 0, 50 or 100'
            }
          ])
        };
      }
    }
  }

  if (fieldType === 'number' || fieldType === 'money') {
    const thresholds = opts.thresholds as Array<{ score: number }> | undefined;
    if (!thresholds?.length) {
      return {
        success: false,
        error: new z.ZodError([
          {
            code: 'custom',
            path: ['thresholds'],
            message: 'thresholds required when scores=true'
          }
        ])
      };
    }
  }

  if (fieldType === 'table' && opts.eol_rules) {
    const rules = opts.eol_rules as Record<string, number>;
    for (const v of Object.values(rules)) {
      if (v !== 0 && v !== 50 && v !== 100) {
        return {
          success: false,
          error: new z.ZodError([
            {
              code: 'custom',
              path: ['eol_rules'],
              message: 'eol_rules values must be 0, 50 or 100'
            }
          ])
        };
      }
    }
  }

  return base;
}

export {
  SCORE_VALUE,
  thresholdSchema,
  columnSchema,
  eolRulesSchema,
  selectOptionsSchema,
  tableOptionsSchema
};
