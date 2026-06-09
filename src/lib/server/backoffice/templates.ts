import { getSql } from '$lib/server/db/client';
import { validateOptions } from '$lib/server/db/field-schemas';
import { ValidationError } from './errors';
import { updateTemplateItemSchema, type UpdateTemplateItemInput } from './schemas';

export type TemplateSection = {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
  items: TemplateItemRow[];
};

export type TemplateItemRow = {
  id: string;
  label: string;
  help: string | null;
  method: string[];
  fieldType: string;
  options: Record<string, unknown>;
  filledBy: string;
  sortOrder: number;
};

export type TemplateDetail = {
  id: string;
  code: string;
  name: string;
  version: string;
  status: string;
  sections: TemplateSection[];
};

export async function getTemplateById(templateId: string): Promise<TemplateDetail | null> {
  const sql = getSql();

  const [template] = await sql<
    { id: string; code: string; name: string; version: string; status: string }[]
  >`
    SELECT id, code, name, version, status
    FROM template
    WHERE id = ${templateId}
    LIMIT 1
  `;

  if (!template) {
    return null;
  }

  const sections = await sql<
    { id: string; code: string; title: string; sort_order: number }[]
  >`
    SELECT id, code, title, sort_order
    FROM section
    WHERE template_id = ${templateId}
    ORDER BY sort_order ASC
  `;

  const sectionIds = sections.map((s) => s.id);
  const items =
    sectionIds.length > 0
      ? await sql<
          {
            id: string;
            section_id: string;
            label: string;
            help_text: string | null;
            method: string[];
            field_type: string;
            options: Record<string, unknown>;
            filled_by: string;
            sort_order: number;
          }[]
        >`
          SELECT id, section_id, label, help_text, method, field_type, options, filled_by, sort_order
          FROM template_item
          WHERE section_id = ANY(${sectionIds}::uuid[])
          ORDER BY sort_order ASC
        `
      : [];

  const itemsBySection = new Map<string, TemplateItemRow[]>();
  for (const item of items) {
    const list = itemsBySection.get(item.section_id) ?? [];
    list.push({
      id: item.id,
      label: item.label,
      help: item.help_text,
      method: item.method,
      fieldType: item.field_type,
      options: item.options,
      filledBy: item.filled_by,
      sortOrder: item.sort_order
    });
    itemsBySection.set(item.section_id, list);
  }

  return {
    id: template.id,
    code: template.code,
    name: template.name,
    version: template.version,
    status: template.status,
    sections: sections.map((s) => ({
      id: s.id,
      code: s.code,
      title: s.title,
      sortOrder: s.sort_order,
      items: itemsBySection.get(s.id) ?? []
    }))
  };
}

export async function listActiveTemplates(): Promise<
  Array<{ id: string; code: string; name: string }>
> {
  const sql = getSql();
  const rows = await sql<{ id: string; code: string; name: string }[]>`
    SELECT id, code, name
    FROM template
    WHERE status = 'active'
    ORDER BY name ASC
  `;
  return rows;
}

export async function updateTemplateItem(input: UpdateTemplateItemInput): Promise<void> {
  const parsed = updateTemplateItemSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.errors[0]?.message ?? 'Datos inválidos');
  }

  const data = parsed.data;
  const sql = getSql();

  const [item] = await sql<{ field_type: string; scores: boolean }[]>`
    SELECT field_type, scores FROM template_item WHERE id = ${data.itemId}
  `;

  if (!item) {
    throw new ValidationError('Ítem no encontrado');
  }

  const optionsValidation = validateOptions(item.field_type as never, data.options, item.scores);
  if (!optionsValidation.success) {
    throw new ValidationError(optionsValidation.error.message);
  }

  await sql`
    UPDATE template_item
    SET
      label = ${data.label},
      help_text = ${data.help ?? null},
      options = ${sql.json(data.options as never)},
      method = ${data.method},
      filled_by = ${data.filled_by}
    WHERE id = ${data.itemId}
  `;
}
