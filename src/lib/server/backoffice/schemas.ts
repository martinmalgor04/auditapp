import { z } from 'zod';
import { AUDIT_TYPES } from '$lib/audit-types';
import { AUDIT_STATUSES } from '$lib/server/db/audit-status';

export const auditTypeSchema = z.enum(AUDIT_TYPES);
export const auditSegmentSchema = z.enum(['A', 'B', 'C']);
export const userRoleSchema = z.enum(['admin', 'tecnico']);
export const filledBySchema = z.enum(['admin', 'cliente', 'tecnico']);

export const dashboardFiltersSchema = z.object({
  type: auditTypeSchema.optional(),
  status: z.enum(AUDIT_STATUSES).optional(),
  clientId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
  sort: z
    .enum([
      'scheduled_at_asc',
      'scheduled_at_desc',
      'last_activity_asc',
      'last_activity_desc'
    ])
    .optional()
    .default('last_activity_desc'),
  page: z.coerce.number().int().min(1).optional().default(1)
});

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;

const newClientSchema = z.object({
  razonSocial: z.string().trim().min(1).max(300),
  cuit: z.string().trim().max(20).optional().default(''),
  rubro: z.string().trim().max(200).optional().default('')
});

export const createAuditSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    newClient: newClientSchema.optional(),
    types: z.array(auditTypeSchema).min(1),
    segment: auditSegmentSchema,
    assignedTechId: z.string().uuid(),
    scheduledAt: z.string().min(1),
    cabResponses: z.record(z.unknown()).optional().default({})
  })
  .refine((data) => Boolean(data.clientId) !== Boolean(data.newClient), {
    message: 'Indicá un cliente existente o datos de cliente nuevo'
  });

export type CreateAuditInput = z.infer<typeof createAuditSchema>;

export const updateAuditSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    types: z.array(auditTypeSchema).min(1).optional(),
    segment: auditSegmentSchema.optional(),
    assignedTechId: z.string().uuid().optional(),
    scheduledAt: z.string().min(1).optional(),
    cabResponses: z.record(z.unknown()).optional(),
    startedAt: z.string().datetime({ offset: true }).nullable().optional(),
    finishedAt: z.string().datetime({ offset: true }).nullable().optional()
  })
  .refine(
    (data) => {
      if (data.startedAt && data.finishedAt) {
        return new Date(data.finishedAt) >= new Date(data.startedAt);
      }
      return true;
    },
    { message: 'La hora de fin no puede ser anterior a la de inicio' }
  );

export type UpdateAuditInput = z.infer<typeof updateAuditSchema>;

export const updateTemplateItemSchema = z.object({
  itemId: z.string().uuid(),
  label: z.string().trim().min(1).max(500),
  help: z.string().trim().max(2000).optional().nullable(),
  options: z.record(z.unknown()),
  method: z.array(z.enum(['O', 'E', 'C', 'X'])),
  filled_by: filledBySchema
});

export type UpdateTemplateItemInput = z.infer<typeof updateTemplateItemSchema>;

export const userAuditTypesSchema = z.array(auditTypeSchema);

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(200),
  role: userRoleSchema,
  temporaryPassword: z.string().min(8).max(128),
  auditTypes: userAuditTypesSchema.optional().default([])
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().trim().min(1).max(200),
  role: userRoleSchema,
  active: z.coerce.boolean(),
  auditTypes: userAuditTypesSchema.optional().default([])
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  temporaryPassword: z.string().min(8).max(128)
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const deactivateUserSchema = z.object({
  userId: z.string().uuid()
});
