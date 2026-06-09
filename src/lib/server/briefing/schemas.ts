import { z } from 'zod';
import type { FieldType } from '$lib/server/db/field-schemas';

export const briefingSaveSchema = z.object({
  itemId: z.string().uuid(),
  value: z.unknown(),
  na: z.boolean().optional().default(false)
});

const permissiveText = z.string();
const permissiveNumber = z.number().min(0);
const permissiveBool = z.boolean();
const permissiveTri = z.enum(['si', 'no', 'parcial']);
const permissiveDate = z.string();
const permissiveList = z.array(z.string());

function permissiveSelect(choices: string[]) {
  if (choices.length === 0) {
    return z.string();
  }
  return z.string();
}

function permissiveMultiselect(_choices: string[]) {
  return z.array(z.string());
}

/** Validación permisiva en frontera (R12): acepta parciales, rechaza tipos incorrectos. */
export function valueSchemaByFieldType(
  fieldType: FieldType,
  options?: unknown
): z.ZodType {
  const opts = (options ?? {}) as Record<string, unknown>;
  const choices = Array.isArray(opts.choices) ? (opts.choices as string[]) : [];

  switch (fieldType) {
    case 'text':
      return permissiveText;
    case 'number':
    case 'money':
      return permissiveNumber;
    case 'bool':
      return permissiveBool;
    case 'tri':
      return permissiveTri;
    case 'select':
      return permissiveSelect(choices);
    case 'multiselect':
      return permissiveMultiselect(choices);
    case 'date':
    case 'datetime':
      return permissiveDate;
    case 'list':
      return permissiveList;
    default:
      return z.never();
  }
}

export function parseBriefingValue(
  fieldType: FieldType,
  options: unknown,
  value: unknown,
  na: boolean
): unknown {
  if (na) {
    return null;
  }
  return valueSchemaByFieldType(fieldType, options).parse(value);
}
