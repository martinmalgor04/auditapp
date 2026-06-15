import { z } from 'zod';

/** 100 MB por defecto, sobreescribible por env REUNION_MAX_AUDIO_BYTES. */
export function getReunionMaxAudioBytes(): number {
  const raw = process.env.REUNION_MAX_AUDIO_BYTES;
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 104_857_600; // 100 MB
}

export const REUNION_AUDIO_CONTENT_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/x-m4a'
] as const;

export type ReunionAudioContentType = (typeof REUNION_AUDIO_CONTENT_TYPES)[number];

export const reunionConsentSchema = z.object({
  session_type: z.enum(['kickoff', 'visita', 'otro']).default('visita'),
  consent_recorded_at: z.coerce.date(),
  consent_note: z.string().max(500).optional()
});

export const reunionAudioPresignSchema = z.object({
  filename: z.string().min(1).max(255),
  content_type: z.enum(REUNION_AUDIO_CONTENT_TYPES),
  size_bytes: z
    .number()
    .int()
    .positive()
    .refine(
      (n) => n <= getReunionMaxAudioBytes(),
      (n) => ({
        message: `El archivo supera el límite máximo (${n} > ${getReunionMaxAudioBytes()} bytes)`
      })
    )
});

export const reunionConfirmSchema = z.object({
  r2_key: z.string().min(1),
  filename: z.string().min(1).max(255),
  content_type: z.enum(REUNION_AUDIO_CONTENT_TYPES),
  size_bytes: z.number().int().positive()
});

export const reunionProposalSchema = z.object({
  item_id: z.string().uuid(),
  proposed_value: z.unknown(),
  quote: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1)
});

export const reunionEditProposalSchema = z.object({
  final_value: z.unknown()
});

export type ReunionConsentInput = z.infer<typeof reunionConsentSchema>;
export type ReunionAudioPresignInput = z.infer<typeof reunionAudioPresignSchema>;
export type ReunionConfirmInput = z.infer<typeof reunionConfirmSchema>;
export type ReunionProposalInput = z.infer<typeof reunionProposalSchema>;
