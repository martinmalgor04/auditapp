import { z } from 'zod';
import { BUNDLE_SCHEMA_VERSION } from './version';

/**
 * Clave natural de un `template_item`. `template_item` no tiene columna `code`
 * (a diferencia de `template` {code,version} y `section` UNIQUE(template_id, code)),
 * así que se identifica por la tupla estable dentro de su sección (R4, OQ-1).
 */
export const itemKeySchema = z.object({
  section_code: z.string(),
  field_type: z.string(),
  sort_order: z.number().int(),
  label: z.string()
});

export type ItemKey = z.infer<typeof itemKeySchema>;

/** Referencia a usuario por email (clave natural, nunca UUID de origen). */
export const userRefSchema = z.object({ email: z.string().email() }).nullable();

export type UserRef = z.infer<typeof userRefSchema>;

/** Referencia a cliente por clave natural; snapshot mínimo para match-or-create (permissive). */
export const clientRefSchema = z.object({
  cuit: z.string().nullable(),
  razon_social: z.string(),
  rubro: z.string().nullable().optional(),
  provincia: z.string().nullable().optional()
});

export type ClientRef = z.infer<typeof clientRefSchema>;

/** Referencia a template por {code, version}. */
export const templateRefSchema = z.object({ code: z.string(), version: z.string() });

export type TemplateRef = z.infer<typeof templateRefSchema>;

const responseSchema = z.object({
  item_key: itemKeySchema,
  value: z.unknown(), // jsonb; attachment_ids embebidos se remapean en import (R11)
  na: z.boolean(),
  observations: z.string().nullable(),
  source: z.enum(['admin', 'cliente', 'tecnico']),
  updated_by: userRefSchema
});

const sectionScoreSchema = z.object({
  template: templateRefSchema,
  section_code: z.string(),
  score: z.number().int().min(0).max(100).nullable(),
  // [{itemId,points}] — itemId NO se remapea: es local al cálculo de score (decisión design).
  score_breakdown: z.unknown(),
  observations: z.string().nullable()
});

const closureSchema = z
  .object({
    indice_it: z.number().int().min(0).max(100).nullable(),
    indice_erp: z.number().int().min(0).max(100).nullable(),
    top_risks: z.unknown(),
    quick_wins: z.unknown(),
    upsell_findings: z.unknown(),
    next_step: z.string().nullable(),
    closed_by: userRefSchema,
    closed_at: z.string().datetime().nullable()
  })
  .nullable();

const attachmentRefSchema = z.object({
  // SOLO para remapear attachment_ids embebidos en value; NO se persiste como FK.
  origin_id: z.string().uuid(),
  r2_key: z.string().min(1),
  filename: z.string(),
  content_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  kind: z.enum(['photo', 'export']),
  item_key: itemKeySchema.nullable(),
  uploaded_by: userRefSchema
});

export const auditBundleSchema = z.object({
  bundle_schema_version: z.literal(BUNDLE_SCHEMA_VERSION),
  dedupe_key: z.object({
    origin_instance_id: z.string(),
    origin_audit_id: z.string().uuid()
  }),
  exported_at: z.string().datetime(),
  header: z.object({
    name: z.string(),
    types: z.array(z.string()),
    templates: z.array(templateRefSchema),
    segment: z.enum(['A', 'B', 'C']),
    status: z.enum([
      'borrador',
      'briefing_enviado',
      'briefing_completo',
      'en_relevamiento',
      'en_cierre',
      'cerrada'
    ]),
    client: clientRefSchema,
    assigned_tech: userRefSchema,
    created_by: userRefSchema,
    scheduled_at: z.string().datetime().nullable(),
    closed_at: z.string().datetime().nullable()
    // public_token NO se exporta: único por instancia, se regenera en destino (OQ-3).
    // archived_at NO se exporta: estado local de la instancia.
  }),
  responses: z.array(responseSchema),
  section_scores: z.array(sectionScoreSchema),
  closure: closureSchema,
  attachments: z.array(attachmentRefSchema)
});

export type AuditBundle = z.infer<typeof auditBundleSchema>;
export type BundleResponse = z.infer<typeof responseSchema>;
export type BundleSectionScore = z.infer<typeof sectionScoreSchema>;
export type BundleClosure = z.infer<typeof closureSchema>;
export type BundleAttachment = z.infer<typeof attachmentRefSchema>;
export type BundleStatus = AuditBundle['header']['status'];
