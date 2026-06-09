import {
  listClienteItems,
  listResponsesForAudit
} from '$lib/server/db/briefing';
import type { FieldType } from '$lib/server/db/field-schemas';
import type { BriefingContext } from './validate-token';

export type BriefingItem = {
  id: string;
  label: string;
  helpText: string | null;
  fieldType: FieldType;
  options: unknown;
  required: boolean;
  allowNa: boolean;
  sortOrder: number;
  value: unknown | null;
  na: boolean;
};

export function computeStepCount(itemCount: number): 1 | 2 | 3 {
  if (itemCount <= 8) {
    return 1;
  }
  if (itemCount <= 12) {
    return 2;
  }
  return 3;
}

export async function loadBriefingForm(ctx: BriefingContext): Promise<{
  items: BriefingItem[];
  stepCount: 1 | 2 | 3;
}> {
  const [itemRows, responseRows] = await Promise.all([
    listClienteItems(ctx.audit.id),
    listResponsesForAudit(ctx.audit.id)
  ]);

  const responseMap = new Map(
    responseRows.map((r) => [r.item_id, { value: r.value, na: r.na }])
  );

  const items: BriefingItem[] = itemRows.map((row) => {
    const resp = responseMap.get(row.id);
    return {
      id: row.id,
      label: row.label,
      helpText: row.help_text,
      fieldType: row.field_type,
      options: row.options,
      required: row.required,
      allowNa: row.allow_na,
      sortOrder: row.sort_order,
      value: resp?.value ?? null,
      na: resp?.na ?? false
    };
  });

  return {
    items,
    stepCount: computeStepCount(items.length)
  };
}
