import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FieldType } from '$lib/server/db/field-schemas';
import { valueSchemaByFieldType } from './value-schemas';

export { formBackupSchema, type FormBackup } from '$lib/form/backup-schema';

export const AUTOSAVE_DEBOUNCE_MS = 600;

export const formSaveSchema = z.object({
  itemId: z.string().uuid(),
  value: z.unknown(),
  na: z.boolean().optional().default(false),
  notes: z.string().nullable().optional()
});

import { formBackupSchema, type FormBackup } from '$lib/form/backup-schema';

const tableRowSchema = z.object({
  row_id: z.string().uuid(),
  cells: z.record(z.unknown()),
  attachment_ids: z.array(z.string().uuid()).default([])
});

export const tableValueSchema = z.object({
  rows: z.array(tableRowSchema)
});

export function parseFormValue(
  fieldType: FieldType,
  options: unknown,
  value: unknown,
  na: boolean
): unknown {
  if (na) {
    return null;
  }

  if (fieldType === 'table') {
    const parsed = tableValueSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    if (Array.isArray(value)) {
      return {
        rows: (value as Record<string, unknown>[]).map((cells) => ({
          row_id: randomUUID(),
          cells,
          attachment_ids: []
        }))
      };
    }
  }

  if (fieldType === 'file_ref') {
    if (typeof value === 'string' || Array.isArray(value)) {
      const ids = Array.isArray(value) ? value : [value];
      return { attachment_ids: ids };
    }
    if (value && typeof value === 'object' && 'attachment_ids' in value) {
      return value;
    }
  }

  return valueSchemaByFieldType(fieldType, options).parse(value);
}
