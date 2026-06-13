import { z } from 'zod';
import { reportInternalDraftSchema } from '$lib/server/informe/schemas';
import { upsellFindingSchema } from '$lib/server/canonical/schema';
import {
  PSYS_PROPOSAL_STATUSES,
  type PsysProposalStatus,
  isKnownPsysStatus
} from '$lib/psys/constants';

export { PSYS_PROPOSAL_STATUSES, type PsysProposalStatus, isKnownPsysStatus };

export const PSYS_CONTRACT_VERSION = '1.0';

const psysClienteSchema = z
  .object({
    razon_social: z.string().min(1),
    cuit: z.string().nullable(),
    email: z.string().nullable(),
    telefono: z.string().nullable(),
    direccion: z.string().nullable(),
    provincia: z.string().nullable()
  })
  .strict();

const psysInternalNotesSchema = z
  .object({
    recomendaciones_presupuesto: reportInternalDraftSchema.shape.recomendaciones_presupuesto,
    upsell_findings: z.array(upsellFindingSchema),
    indices: z
      .object({
        it: z.number().int().min(0).max(100).optional(),
        erp: z.number().int().min(0).max(100).optional()
      })
      .strict(),
    informe_url: z.string().url()
  })
  .strict();

export const psysProposalPayloadSchema = z
  .object({
    contract_version: z.literal(PSYS_CONTRACT_VERSION),
    source: z
      .object({
        system: z.literal('auditapp'),
        audit_id: z.string().uuid(),
        report_version: z.number().int().min(1)
      })
      .strict(),
    template_slug: z.string().min(1),
    cliente: psysClienteSchema,
    titulo: z.string().min(1),
    moneda: z.literal('ARS'),
    internal_notes: psysInternalNotesSchema
  })
  .strict();

export const psysProposalRefSchema = z
  .object({
    id: z.string().uuid(),
    number_display: z.string().nullable(),
    status: z.string().min(1),
    url: z.string().url()
  })
  .strict();

export const psysProposalResponseSchema = z
  .object({
    proposal: psysProposalRefSchema
  })
  .strict();

export type PsysProposalPayload = z.infer<typeof psysProposalPayloadSchema>;
export type PsysProposalRef = z.infer<typeof psysProposalRefSchema>;
