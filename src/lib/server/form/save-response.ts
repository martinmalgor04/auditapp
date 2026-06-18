import type { AppUser } from '$lib/server/auth/types';
import {
  getAuditFormHeader,
  getFormItemForAudit,
  upsertFormResponse
} from '$lib/server/db/audit-form';
import { computeSectionScore } from '$lib/scoring/section-score';
import {
  AuditFormNotAllowedError,
  AuditFormNotEditableError,
  FormItemNotAllowedError
} from './errors';
import { assertFormAccess } from './load-form';
import { mergeTableAttachmentIds } from './merge-table';
import { parseFormValue } from './schemas';

export async function saveFormResponse(
  auditId: string,
  user: AppUser,
  payload: { itemId: string; value: unknown; na?: boolean; notes?: string | null }
): Promise<{
  updatedAt: string;
  sectionScore?: { score: number | null; band: string; sectionId: string };
}> {
  const header = await getAuditFormHeader(auditId);
  if (!header) {
    throw new AuditFormNotAllowedError('Auditoría no encontrada');
  }

  await assertFormAccess(header, user);

  const item = await getFormItemForAudit(auditId, payload.itemId);
  if (!item) {
    throw new FormItemNotAllowedError();
  }

  // #32 (R18, R20): el CAB compartido, una vez confirmado, es solo-lectura para
  // cualquier técnico que no sea el confirmador ni admin. Las ediciones de ítems
  // del CAB de un no-confirmador se rechazan; las secciones de área no se tocan.
  if (
    item.section_code === 'CAB' &&
    header.cab_confirmed_at !== null &&
    header.cab_confirmed_by !== user.id &&
    user.role !== 'admin'
  ) {
    throw new FormItemNotAllowedError();
  }

  const na = payload.na ?? false;
  let value = parseFormValue(item.field_type, item.options, payload.value, na);

  if (item.field_type === 'table' && !na) {
    // Red de seguridad: nunca des-asociar fotos confirmadas de filas que el
    // payload conserva (clientes con estado viejo). Ver merge-table.ts.
    const { listFormResponses } = await import('$lib/server/db/audit-form');
    const existing = (await listFormResponses(auditId)).find((r) => r.item_id === payload.itemId);
    if (existing) {
      value = mergeTableAttachmentIds(existing.value, value);
    }
  }

  const result = await upsertFormResponse(
    auditId,
    payload.itemId,
    value,
    na,
    payload.notes ?? null,
    user.id
  );

  const sectionItems = await getSectionScoringItems(auditId, item.section_id);
  const responses = await getSectionResponses(auditId, sectionItems.map((i) => i.id));
  responses.set(payload.itemId, { value, na });

  const score = computeSectionScore({ items: sectionItems, responses });

  return {
    updatedAt: result.updatedAt,
    sectionScore: {
      score: score.score,
      band: score.band,
      sectionId: item.section_id
    }
  };
}

async function getSectionScoringItems(
  auditId: string,
  sectionId: string
): Promise<Array<{ id: string; fieldType: import('$lib/server/db/field-schemas').FieldType; options: unknown; scores: boolean }>> {
  const { listFormItems } = await import('$lib/server/db/audit-form');
  const items = await listFormItems(auditId);
  return items
    .filter((i) => i.section_id === sectionId)
    .map((i) => ({
      id: i.id,
      fieldType: i.field_type,
      options: i.options,
      scores: i.scores
    }));
}

async function getSectionResponses(
  auditId: string,
  itemIds: string[]
): Promise<Map<string, { value: unknown; na: boolean }>> {
  const { listFormResponses } = await import('$lib/server/db/audit-form');
  const rows = await listFormResponses(auditId);
  const map = new Map<string, { value: unknown; na: boolean }>();
  for (const row of rows) {
    if (itemIds.includes(row.item_id)) {
      map.set(row.item_id, { value: row.value, na: row.na });
    }
  }
  return map;
}

export { AuditFormNotEditableError, AuditFormNotAllowedError };
