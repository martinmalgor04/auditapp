import type { AppUser } from '$lib/server/auth/types';
import {
  FORM_EDITABLE_STATUSES,
  getAuditFormHeader,
  listFormItems,
  listFormResponses,
  listFormSections,
  type FormItemRow
} from '$lib/server/db/audit-form';
import type { FieldType } from '$lib/server/db/field-schemas';
import { computeSectionScore, type ScoreBand } from '$lib/scoring/section-score';
import { AuditFormNotAllowedError, AuditFormNotEditableError } from './errors';

export type FormItem = {
  id: string;
  sectionId: string;
  label: string;
  helpText: string | null;
  fieldType: FieldType;
  options: unknown;
  method: 'O' | 'E' | 'C' | 'X';
  required: boolean;
  allowNa: boolean;
  filledBy: 'tecnico' | 'admin' | 'cliente';
  sortOrder: number;
  value: unknown | null;
  na: boolean;
  notes: string | null;
  preloaded: boolean;
};

export type FormSection = {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
  items: FormItem[];
  liveScore: number | null;
  scoreBand: ScoreBand;
};

export type AuditHeader = {
  id: string;
  name: string;
  razonSocial: string;
  status: string;
  types: string[];
  segment: string;
};

function primaryMethod(methods: string[]): 'O' | 'E' | 'C' | 'X' {
  const first = methods[0];
  if (first === 'O' || first === 'E' || first === 'C' || first === 'X') {
    return first;
  }
  return 'O';
}

function isItemComplete(item: FormItem): boolean {
  if (item.na) return true;
  if (item.value === null || item.value === undefined) return false;
  if (typeof item.value === 'string' && item.value.trim() === '') return false;
  if (Array.isArray(item.value) && item.value.length === 0) return false;
  if (
    typeof item.value === 'object' &&
    item.value !== null &&
    'rows' in item.value &&
    Array.isArray((item.value as { rows: unknown[] }).rows) &&
    (item.value as { rows: unknown[] }).rows.length === 0
  ) {
    return false;
  }
  return true;
}

function buildFormItem(row: FormItemRow, responseMap: Map<string, ReturnType<typeof mapResponse>>): FormItem {
  const resp = responseMap.get(row.id);
  const preloaded = resp !== undefined && resp.source === 'cliente';

  return {
    id: row.id,
    sectionId: row.section_id,
    label: row.label,
    helpText: row.help_text,
    fieldType: row.field_type,
    options: row.options,
    method: primaryMethod(row.method),
    required: row.required,
    allowNa: row.allow_na,
    filledBy: row.filled_by,
    sortOrder: row.sort_order,
    value: resp?.value ?? null,
    na: resp?.na ?? false,
    notes: resp?.observations ?? null,
    preloaded
  };
}

function mapResponse(r: {
  value: unknown;
  na: boolean;
  observations: string | null;
  source: string;
  updated_by: string | null;
}) {
  return {
    value: r.value,
    na: r.na,
    observations: r.observations,
    source: r.source as 'admin' | 'cliente' | 'tecnico',
    updatedBy: r.updated_by
  };
}

export function assertFormAccess(audit: NonNullable<Awaited<ReturnType<typeof getAuditFormHeader>>>, user: AppUser): void {
  if (user.role !== 'admin' && audit.assigned_tech_id !== user.id) {
    throw new AuditFormNotAllowedError();
  }
  if (!FORM_EDITABLE_STATUSES.includes(audit.status)) {
    throw new AuditFormNotEditableError();
  }
}

export async function loadAuditForm(
  auditId: string,
  user: AppUser
): Promise<{ audit: AuditHeader; sections: FormSection[]; progressPct: number }> {
  const header = await getAuditFormHeader(auditId);
  if (!header) {
    throw new AuditFormNotAllowedError('Auditoría no encontrada');
  }

  assertFormAccess(header, user);

  const [sectionRows, itemRows, responseRows] = await Promise.all([
    listFormSections(auditId),
    listFormItems(auditId),
    listFormResponses(auditId)
  ]);

  const responseMap = new Map(
    responseRows.map((r) => [r.item_id, mapResponse(r)])
  );

  const itemsBySection = new Map<string, FormItem[]>();
  for (const row of itemRows) {
    const item = buildFormItem(row, responseMap);
    const list = itemsBySection.get(row.section_id) ?? [];
    list.push(item);
    itemsBySection.set(row.section_id, list);
  }

  const allItems = itemRows.map((row) => buildFormItem(row, responseMap));
  const progressTotal = allItems.length;
  const progressComplete = allItems.filter(isItemComplete).length;
  const progressPct = progressTotal > 0 ? Math.round((progressComplete / progressTotal) * 100) : 0;

  const sections: FormSection[] = sectionRows.map((sec) => {
    const items = itemsBySection.get(sec.id) ?? [];
    const respMap = new Map(
      items.map((it) => [
        it.id,
        { value: it.value, na: it.na }
      ])
    );
    const scoreItems = itemRows
      .filter((r) => r.section_id === sec.id)
      .map((r) => ({
        id: r.id,
        fieldType: r.field_type,
        options: r.options,
        scores: r.scores
      }));

    const live = computeSectionScore({
      items: scoreItems,
      responses: respMap
    });

    return {
      id: sec.id,
      code: sec.code,
      title: sec.title,
      sortOrder: sec.sort_order,
      items,
      liveScore: live.score,
      scoreBand: live.band
    };
  });

  return {
    audit: {
      id: header.id,
      name: header.name,
      razonSocial: header.razon_social,
      status: header.status,
      types: header.types,
      segment: header.segment
    },
    sections,
    progressPct
  };
}

export async function loadAuditFormForApi(
  auditId: string,
  user: AppUser
): Promise<ReturnType<typeof loadAuditForm>> {
  return loadAuditForm(auditId, user);
}
