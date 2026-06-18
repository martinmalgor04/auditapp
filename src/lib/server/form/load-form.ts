import type { AppUser } from '$lib/server/auth/types';
import type { AuditType } from '$lib/audit-types';
import { techAssignedTypes } from '$lib/server/db/audit-assignment';
import { resolveTemplateIdsForTypes } from '$lib/server/backoffice/audits';
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
import { computeLiveScores } from '$lib/server/scoring/live';
import { indexToSemaphore } from '$lib/server/scoring/semaphore';
import type { Semaphore } from '$lib/server/scoring/types';
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

/**
 * #32 (R14, R22): el acceso al form se decide por **asignación efectiva**
 * (`audit_assignment`), no por overlap de especialidad. Admin sin restricción;
 * técnico sin ningún tipo asignado a la auditoría → 403.
 */
export async function assertFormAccess(
  audit: NonNullable<Awaited<ReturnType<typeof getAuditFormHeader>>>,
  user: AppUser
): Promise<void> {
  if (user.role !== 'admin' && user.role !== 'tecnico') {
    throw new AuditFormNotAllowedError();
  }
  if (user.role === 'tecnico') {
    const assigned = await techAssignedTypes(audit.id, user.id);
    if (assigned.length === 0) {
      throw new AuditFormNotAllowedError();
    }
  }
  if (!FORM_EDITABLE_STATUSES.includes(audit.status)) {
    throw new AuditFormNotEditableError();
  }
}

/**
 * #32 (R11, R12, R13, R15): tipos visibles para el usuario (admin → todos los de
 * la auditoría; técnico → sus tipos asignados) → conjunto de `template_id`
 * visibles para filtrar secciones.
 */
async function visibleTemplateIds(
  audit: { id: string; types: string[] },
  user: AppUser
): Promise<Set<string>> {
  const visibleTypes: AuditType[] =
    user.role === 'admin'
      ? (audit.types as AuditType[])
      : await techAssignedTypes(audit.id, user.id);
  const ids = visibleTypes.length > 0 ? await resolveTemplateIdsForTypes(visibleTypes) : [];
  return new Set(ids);
}

export type LiveIndices = {
  it: number | null;
  erp: number | null;
  itSemaphore: Semaphore | null;
  erpSemaphore: Semaphore | null;
};

export type CabState = {
  locked: boolean;
  confirmed: boolean;
  confirmedBy: string | null;
  canConfirm: boolean;
};

export async function loadAuditForm(
  auditId: string,
  user: AppUser
): Promise<{
  audit: AuditHeader;
  sections: FormSection[];
  progressPct: number;
  liveIndices: LiveIndices;
  cab: CabState;
}> {
  const header = await getAuditFormHeader(auditId);
  if (!header) {
    throw new AuditFormNotAllowedError('Auditoría no encontrada');
  }

  await assertFormAccess(header, user);

  const visibleTemplates = await visibleTemplateIds(header, user);

  const [allSectionRows, allItemRows, responseRows] = await Promise.all([
    listFormSections(auditId),
    listFormItems(auditId),
    listFormResponses(auditId)
  ]);

  // #32 (R15): el CAB es único y compartido. Hay una sección CAB por template;
  // se conserva UNA sola (la del template canónico: menor sort_order, luego id),
  // y sus ítems. El resto de las secciones se filtra a los templates visibles
  // del usuario (R11/R12); admin ve todas (R13).
  const cabSections = allSectionRows
    .filter((s) => s.code === 'CAB')
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const canonicalCabSectionId = cabSections[0]?.id ?? null;

  const sectionRows = allSectionRows.filter((s) => {
    if (s.code === 'CAB') {
      return s.id === canonicalCabSectionId;
    }
    return visibleTemplates.has(s.template_id);
  });
  const visibleSectionIds = new Set(sectionRows.map((s) => s.id));
  const itemRows = allItemRows.filter((it) => visibleSectionIds.has(it.section_id));

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

  const liveScores = await computeLiveScores(auditId);
  const liveScoreBySection = new Map(
    liveScores.sectionScores.map((s) => [s.sectionId, s.score])
  );

  const sectionsWithLive = sections.map((sec) => {
    const serverScore = liveScoreBySection.get(sec.id);
    if (serverScore !== undefined) {
      return {
        ...sec,
        liveScore: serverScore,
        scoreBand: indexToSemaphore(serverScore) as ScoreBand
      };
    }
    return sec;
  });

  const indiceIt = liveScores.indiceIt;
  const indiceErp = liveScores.indiceErp;

  // #32 (R16, R18, R19): estado del CAB compartido.
  const confirmed = header.cab_confirmed_at !== null;
  const isConfirmer = header.cab_confirmed_by === user.id;
  const cab: CabState = {
    confirmed,
    confirmedBy: header.cab_confirmed_by,
    // Bloqueado (solo-lectura) si está confirmado y el usuario no es ni el
    // confirmador ni admin (el confirmador y el admin pueden reeditar, R18).
    locked: confirmed && !isConfirmer && user.role !== 'admin',
    // Puede confirmar mientras no esté confirmado (cualquier técnico asignado o admin).
    canConfirm: !confirmed
  };

  return {
    audit: {
      id: header.id,
      name: header.name,
      razonSocial: header.razon_social,
      status: header.status,
      types: header.types,
      segment: header.segment
    },
    sections: sectionsWithLive,
    progressPct,
    liveIndices: {
      it: indiceIt,
      erp: indiceErp,
      itSemaphore: indiceIt !== null ? indexToSemaphore(indiceIt) : null,
      erpSemaphore: indiceErp !== null ? indexToSemaphore(indiceErp) : null
    },
    cab
  };
}

export async function loadAuditFormForApi(
  auditId: string,
  user: AppUser
): Promise<ReturnType<typeof loadAuditForm>> {
  return loadAuditForm(auditId, user);
}
