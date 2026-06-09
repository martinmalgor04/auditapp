import { z } from 'zod';
import type { FieldType } from '$lib/server/db/field-schemas';

const permissiveText = z.string();
const permissiveNumber = z.number();
const permissiveBool = z.boolean();
const permissiveTri = z.enum(['si', 'no', 'parcial']);
const permissiveDate = z.string();
const permissiveList = z.array(z.string());
const permissiveTable = z.unknown();
const permissiveFileRef = z.unknown();

function permissiveSelect(_choices: string[]) {
  return z.string();
}

function permissiveMultiselect(_choices: string[]) {
  return z.array(z.string());
}

/** Validación permisiva en frontera del form técnico. */
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
    case 'table':
      return permissiveTable;
    case 'file_ref':
      return permissiveFileRef;
    default:
      return z.never();
  }
}
