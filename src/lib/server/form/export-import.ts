import type { AppUser } from '$lib/server/auth/types';
import {
  batchUpsertFormResponses,
  getAuditFormHeader,
  listFormItems
} from '$lib/server/db/audit-form';
import { FormImportValidationError } from './errors';
import { assertFormAccess } from './load-form';
import { formBackupSchema, parseFormValue, type FormBackup } from './schemas';

export async function importFormBackup(
  auditId: string,
  user: AppUser,
  raw: unknown
): Promise<{ imported: number }> {
  const parsed = formBackupSchema.safeParse(raw);
  if (!parsed.success) {
    throw new FormImportValidationError(
      'FORM_IMPORT_VALIDATION',
      parsed.error.issues[0]?.message ?? 'JSON de respaldo inválido'
    );
  }

  const backup: FormBackup = parsed.data;
  if (backup.audit_id !== auditId) {
    throw new FormImportValidationError(
      'FORM_IMPORT_AUDIT_MISMATCH',
      'El respaldo pertenece a otra auditoría'
    );
  }

  const header = await getAuditFormHeader(auditId);
  if (!header) {
    throw new FormImportValidationError('FORM_IMPORT_VALIDATION', 'Auditoría no encontrada');
  }

  assertFormAccess(header, user);

  const items = await listFormItems(auditId);
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const rows: Array<{ itemId: string; value: unknown; na: boolean; notes?: string | null }> = [];

  for (const resp of backup.responses) {
    const item = itemMap.get(resp.item_id);
    if (!item) continue;

    const value = parseFormValue(item.field_type, item.options, resp.value, resp.na);
    rows.push({
      itemId: resp.item_id,
      value,
      na: resp.na,
      notes: resp.notes ?? null
    });
  }

  await batchUpsertFormResponses(auditId, user.id, rows);
  return { imported: rows.length };
}

export function buildFormBackup(
  auditId: string,
  responses: Array<{ itemId: string; value: unknown; na: boolean; notes?: string | null }>
): FormBackup {
  return {
    schema_version: '1.0',
    audit_id: auditId,
    exported_at: new Date().toISOString(),
    responses: responses.map((r) => ({
      item_id: r.itemId,
      value: r.value,
      na: r.na,
      notes: r.notes ?? null
    }))
  };
}
