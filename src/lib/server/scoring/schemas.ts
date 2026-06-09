import { z } from 'zod';

export const topRiskSchema = z.object({
  text: z.string().trim().min(1).max(500),
  severity: z.enum(['baja', 'media', 'alta', 'critica'])
});

export const closureFieldsSchema = z.object({
  topRisks: z.array(topRiskSchema).max(5),
  quickWins: z
    .array(z.string().trim().min(1).max(500))
    .max(10)
    .transform((arr) => arr.filter((s) => s.length > 0)),
  upsellFindings: z
    .array(z.string().trim().min(1).max(500))
    .max(20)
    .transform((arr) => arr.filter((s) => s.length > 0)),
  nextStep: z.string().trim().max(2000).nullable(),
  sectionObservations: z.record(z.string().uuid(), z.string().max(4000).nullable()).optional()
});

export type ClosureFieldsParsed = z.infer<typeof closureFieldsSchema>;

export function parseClosureFieldsFromFormData(formData: FormData): ClosureFieldsParsed {
  const topRisksRaw = String(formData.get('topRisks') ?? '[]');
  const quickWinsRaw = String(formData.get('quickWins') ?? '[]');
  const upsellRaw = String(formData.get('upsellFindings') ?? '[]');
  const nextStepRaw = formData.get('nextStep');
  const sectionObsRaw = String(formData.get('sectionObservations') ?? '{}');

  return closureFieldsSchema.parse({
    topRisks: JSON.parse(topRisksRaw),
    quickWins: JSON.parse(quickWinsRaw),
    upsellFindings: JSON.parse(upsellRaw),
    nextStep:
      nextStepRaw === null || nextStepRaw === undefined || String(nextStepRaw).trim() === ''
        ? null
        : String(nextStepRaw),
    sectionObservations: JSON.parse(sectionObsRaw)
  });
}
