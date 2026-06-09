import { formBackupSchema, type FormBackup } from '$lib/form/backup-schema';
import type { SavePayload } from './autosave';
import type { QueuedSave } from './retry-queue';

export function mergeResponsesForExport(
  auditId: string,
  serverResponses: Array<{ itemId: string; value: unknown; na: boolean; notes?: string | null }>,
  queued: QueuedSave[]
): FormBackup {
  const map = new Map<string, { value: unknown; na: boolean; notes?: string | null }>();

  for (const r of serverResponses) {
    map.set(r.itemId, { value: r.value, na: r.na, notes: r.notes });
  }

  for (const q of queued) {
    if (q.auditId === auditId) {
      map.set(q.itemId, { value: q.value, na: q.na ?? false, notes: q.notes });
    }
  }

  return {
    schema_version: '1.0',
    audit_id: auditId,
    exported_at: new Date().toISOString(),
    responses: [...map.entries()].map(([item_id, r]) => ({
      item_id,
      value: r.value,
      na: r.na,
      notes: r.notes ?? null
    }))
  };
}

export function validateBackupJson(raw: unknown): FormBackup {
  return formBackupSchema.parse(raw);
}

export async function downloadBackupJson(backup: FormBackup, filename?: string): Promise<void> {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `audit-backup-${backup.audit_id.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBackupViaApi(auditId: string, backup: FormBackup): Promise<Response> {
  return fetch(`/api/audits/${auditId}/responses/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backup)
  });
}

export type { SavePayload };
