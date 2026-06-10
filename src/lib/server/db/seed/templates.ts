import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type postgres from 'postgres';

type DbExecutor = postgres.Sql | postgres.TransactionSql;
import { validateOptions, type FieldType } from '../field-schemas';

export type TemplateItemFixture = {
  label: string;
  help_text?: string | null;
  method?: string[];
  field_type: FieldType;
  options?: Record<string, unknown>;
  is_prefillable?: boolean;
  prefill_source?: string | null;
  filled_by: 'admin' | 'cliente' | 'tecnico';
  allow_na?: boolean;
  required?: boolean;
  scores?: boolean;
  item_weight?: number;
  sort_order: number;
};

export type SectionFixture = {
  code: string;
  title: string;
  objective?: string | null;
  standard_ref?: string | null;
  weight: 'bajo' | 'medio' | 'alto' | 'muy_alto';
  has_score?: boolean;
  sort_order: number;
  items: TemplateItemFixture[];
};

export type TemplateFixture = {
  code: string;
  name: string;
  version: string;
  status: 'draft' | 'active' | 'archived';
  sections: SectionFixture[];
};

const TEMPLATES_DIR = join(process.cwd(), 'seed', 'templates');

export async function loadTemplateFixture(filename: string): Promise<TemplateFixture> {
  const raw = await readFile(join(TEMPLATES_DIR, filename), 'utf8');
  return JSON.parse(raw) as TemplateFixture;
}

export async function seedTemplates(sql: DbExecutor): Promise<void> {
  const files = ['it-v2.json', 'erp-tango-v2.json', 'erp-estandar-v1.json'];

  for (const file of files) {
    const fixture = await loadTemplateFixture(file);
    await seedTemplateFixture(sql, fixture);
  }
}

async function seedTemplateFixture(sql: DbExecutor, fixture: TemplateFixture): Promise<void> {
    let templateId: string;
    const [existingTemplate] = await sql<{ id: string }[]>`
      SELECT id FROM template
      WHERE code = ${fixture.code}
        AND version = ${fixture.version}
      LIMIT 1
    `;

    if (existingTemplate) {
      templateId = existingTemplate.id;
      await sql`
        UPDATE template
        SET name = ${fixture.name}, status = ${fixture.status}
        WHERE id = ${templateId}
      `;
    } else {
      const [inserted] = await sql<{ id: string }[]>`
        INSERT INTO template (code, name, version, status)
        VALUES (${fixture.code}, ${fixture.name}, ${fixture.version}, ${fixture.status})
        RETURNING id
      `;
      templateId = inserted.id;
    }

    for (const section of fixture.sections) {
      const [sectionRow] = await sql<{ id: string }[]>`
        INSERT INTO section (
          template_id, code, title, objective, standard_ref,
          weight, has_score, sort_order
        )
        VALUES (
          ${templateId},
          ${section.code},
          ${section.title},
          ${section.objective ?? null},
          ${section.standard_ref ?? null},
          ${section.weight},
          ${section.has_score ?? true},
          ${section.sort_order}
        )
        ON CONFLICT (template_id, code) DO UPDATE SET
          title = EXCLUDED.title,
          objective = EXCLUDED.objective,
          standard_ref = EXCLUDED.standard_ref,
          weight = EXCLUDED.weight,
          has_score = EXCLUDED.has_score,
          sort_order = EXCLUDED.sort_order
        RETURNING id
      `;

      const sectionId = sectionRow.id;

      for (const item of section.items) {
        const scores = item.scores ?? true;
        const options = item.options ?? {};
        const validation = validateOptions(item.field_type, options, scores);
        if (!validation.success) {
          throw new Error(
            `Invalid options for ${fixture.code}/${section.code}/${item.label}: ${validation.error.message}`
          );
        }

        const optionsJson = sql.json(
          JSON.parse(JSON.stringify(options)) as postgres.JSONValue
        );

        const updated = await sql<{ id: string }[]>`
          UPDATE template_item
          SET
            label = ${item.label},
            help_text = ${item.help_text ?? null},
            method = ${item.method ?? []},
            field_type = ${item.field_type},
            options = ${optionsJson},
            is_prefillable = ${item.is_prefillable ?? false},
            prefill_source = ${item.prefill_source ?? null},
            filled_by = ${item.filled_by},
            allow_na = ${item.allow_na ?? false},
            required = ${item.required ?? false},
            scores = ${scores},
            item_weight = ${item.item_weight ?? 1}
          WHERE section_id = ${sectionId}
            AND sort_order = ${item.sort_order}
          RETURNING id
        `;

        if (updated.length === 0) {
          await sql`
            INSERT INTO template_item (
              section_id, label, help_text, method, field_type, options,
              is_prefillable, prefill_source, filled_by, allow_na, required,
              scores, item_weight, sort_order
            )
            VALUES (
              ${sectionId},
              ${item.label},
              ${item.help_text ?? null},
              ${item.method ?? []},
              ${item.field_type},
              ${optionsJson},
              ${item.is_prefillable ?? false},
              ${item.prefill_source ?? null},
              ${item.filled_by},
              ${item.allow_na ?? false},
              ${item.required ?? false},
              ${scores},
              ${item.item_weight ?? 1},
              ${item.sort_order}
            )
          `;
        }
      }
    }
}
