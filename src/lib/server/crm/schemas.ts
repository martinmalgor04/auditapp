import { z } from 'zod';
import { CRM_FUNNEL } from './state-machine';

export const crmSourceSchema = z.enum(['firecrawl', 'referido', 'manual', 'otro']);

export const crmStatusSchema = z.enum([...CRM_FUNNEL, 'descartado']);

const emailField = z
  .string()
  .email('Email inválido')
  .transform((v) => v.trim().toLowerCase());

export const crmLeadBatchItemSchema = z.object({
  email: emailField,
  empresa: z.string().trim().min(1, 'Empresa requerida'),
  source: crmSourceSchema,
  contacto: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  notas: z.string().trim().optional()
});

export const crmLeadBatchSchema = z.array(crmLeadBatchItemSchema).min(1).max(200);

export const crmLeadCreateSchema = z.object({
  email: emailField,
  empresa: z.string().trim().min(1, 'Empresa requerida'),
  source: crmSourceSchema,
  contacto: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  notas: z.string().trim().optional()
});

export const crmLeadUpdateSchema = z
  .object({
    contacto: z.string().trim().nullable().optional(),
    telefono: z.string().trim().nullable().optional(),
    notas: z.string().trim().nullable().optional(),
    proxima_accion: z.string().trim().nullable().optional(),
    proxima_accion_fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)')
      .nullable()
      .optional(),
    presupuesto_ref: z.string().trim().nullable().optional(),
    client_id: z.string().uuid().nullable().optional(),
    audit_id: z.string().uuid().nullable().optional()
  })
  .strict();

export const crmStatusChangeSchema = z.object({
  to: crmStatusSchema
});

export const crmListFiltersSchema = z.object({
  status: crmStatusSchema.optional(),
  source: crmSourceSchema.optional(),
  q: z.string().trim().optional()
});

export type CrmLeadBatchItem = z.infer<typeof crmLeadBatchItemSchema>;
export type CrmLeadCreateInput = z.infer<typeof crmLeadCreateSchema>;
export type CrmLeadUpdateInput = z.infer<typeof crmLeadUpdateSchema>;
