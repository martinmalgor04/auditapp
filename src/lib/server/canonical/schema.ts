import { z } from 'zod';
import { CANONICAL_SCHEMA_VERSION } from './version';

const semverMinor = z.string().regex(/^\d+\.\d+$/);

export const marketDataSchema = z.object({
  erp_actual: z.string().nullable(),
  modulos_tango: z.array(z.string()).nullable(),
  empleados: z.number().int().nullable(),
  puestos: z.number().int().nullable(),
  sedes: z.number().int().nullable(),
  proveedor_correo: z.string().nullable(),
  soporte_it_actual: z.string().nullable()
});

export const canonicalClientSchema = z.object({
  razon_social: z.string().min(1),
  cuit: z.string().nullable(),
  rubro: z.string().nullable(),
  segment: z.enum(['A', 'B', 'C'])
});

export const canonicalTemplateSchema = z.object({
  code: z.string().min(1),
  version: z.string().min(1)
});

export const canonicalItemRowSchema = z.object({
  row_id: z.string().min(1),
  cells: z.record(z.unknown()),
  attachments: z.array(z.string().min(1))
});

export const canonicalItemSchema = z.object({
  item_id: z.string().uuid(),
  label: z.string().min(1),
  field_type: z.string().min(1),
  value: z.unknown(),
  na: z.boolean(),
  score_contribution: z.number().int().min(0).max(100).optional(),
  observations: z.string().nullable(),
  attachments: z.array(z.string().min(1)),
  // #45 (R1, R4) — filas de inventario para ítems field_type='table'. Campo
  // opcional nuevo (MINOR 1.1 → 1.2): los consumidores que lo ignoran siguen
  // validando (R3). Cada fila trae sus celdas y las claves R2 de sus fotos.
  rows: z.array(canonicalItemRowSchema).optional()
});

export const canonicalSectionSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  standard_ref: z.string().nullable(),
  weight: z.enum(['bajo', 'medio', 'alto', 'muy_alto']),
  score: z.number().int().min(0).max(100).nullable(),
  score_basis: z.literal('auto').optional(),
  template_code: z.string().min(1).optional(),
  observations: z.string().nullable(),
  items: z.array(canonicalItemSchema)
});

export const topRiskSchema = z.object({
  text: z.string().min(1),
  severity: z.enum(['baja', 'media', 'alta', 'critica']),
  section: z.string().optional()
});

export const upsellFindingSchema = z.object({
  text: z.string().min(1),
  internal: z.literal(true)
});

export const indicesSchema = z
  .object({
    it: z.number().int().min(0).max(100).optional(),
    erp: z.number().int().min(0).max(100).optional()
  })
  .refine((v) => v.it !== undefined || v.erp !== undefined, {
    message: 'indices must include at least one type'
  });

export const canonicalAuditSchema = z.object({
  schema_version: semverMinor,
  audit_id: z.string().uuid(),
  generated_at: z.string().datetime({ offset: true }),
  client: canonicalClientSchema,
  types: z.array(z.string().min(1)).min(1),
  templates: z.array(canonicalTemplateSchema).min(1),
  sections: z.array(canonicalSectionSchema),
  indices: indicesSchema,
  top_risks: z.array(topRiskSchema),
  quick_wins: z.array(z.string()),
  upsell_findings: z.array(upsellFindingSchema),
  next_step: z.string().nullable(),
  market_data: marketDataSchema,
  closed_at: z.string().datetime({ offset: true }).nullable()
});

export type MarketData = z.infer<typeof marketDataSchema>;
export type CanonicalAudit = z.infer<typeof canonicalAuditSchema>;
export type CanonicalSection = z.infer<typeof canonicalSectionSchema>;
export type CanonicalItem = z.infer<typeof canonicalItemSchema>;
export type CanonicalItemRow = z.infer<typeof canonicalItemRowSchema>;
export type TopRiskCanonical = z.infer<typeof topRiskSchema>;
export type UpsellFinding = z.infer<typeof upsellFindingSchema>;

/** Valida que schema_version del payload coincida con la constante exportada. */
export function assertSchemaVersionMatchesConstant(payload: { schema_version: string }): void {
  if (payload.schema_version !== CANONICAL_SCHEMA_VERSION) {
    throw new Error(
      `schema_version mismatch: expected ${CANONICAL_SCHEMA_VERSION}, got ${payload.schema_version}`
    );
  }
}
