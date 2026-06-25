import { z } from 'zod';
import { logger } from '$lib/server/logger';
import { isInformeShareRateLimited } from './rate-limit';
import { resolveShareByToken } from './share';
import {
  getSurveyByShareId,
  insertSurveyResponse,
  type SurveyResponseRow
} from '$lib/server/db/survey-responses';

/**
 * Schema estricto de la respuesta de encuesta (R4). Las escalas usan `z.coerce`
 * porque el form action recibe strings; el booleano se parsea por literal
 * explícito ('true'/'false') para no corromper 'false' → true. `.strict()`
 * rechaza campos extra. Comentario opcional, acotado a 2000 chars, normalizado
 * a null si queda vacío.
 */
export const surveyResponseSchema = z
  .object({
    valoracion_global: z.coerce.number().int().min(1).max(5),
    claridad_informe: z.coerce.number().int().min(1).max(5),
    // El form envía 'true'/'false' como string (radios value="true"/"false").
    // z.coerce.boolean() coacciona CUALQUIER string no vacío a true ('false' → true),
    // corrompiendo la conformidad. Parseo explícito del literal.
    conforme_hallazgos: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true'),
    comentario: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((v) => (v ? v : null))
  })
  .strict();

export type SurveyResponseInput = z.infer<typeof surveyResponseSchema>;

/** Set fijo de preguntas: fuente única para el form y la validación. */
export const SURVEY_QUESTIONS = {
  valoracion_global: {
    label: '¿Cómo valorás el informe en general?',
    type: 'escala_1_5' as const
  },
  claridad_informe: {
    label: '¿Qué tan claro te resultó el informe?',
    type: 'escala_1_5' as const
  },
  conforme_hallazgos: {
    label: '¿Estás conforme con los hallazgos?',
    type: 'si_no' as const
  },
  comentario: {
    label: 'Comentario (opcional)',
    type: 'texto' as const
  }
} as const;

export type SurveyEstado = 'pendiente' | 'respondida';

/** Solo campos públicos / mostrables — nunca share_id, report_id ni ids internos (R2). */
export type SurveyResponseView = {
  valoracion_global: number;
  claridad_informe: number;
  conforme_hallazgos: boolean;
  comentario: string | null;
  submitted_at: string; // ISO
};

export type SurveyState =
  | { estado: 'pendiente' }
  | { estado: 'respondida'; respuesta: SurveyResponseView };

/** Proyecta una fila a la vista pública (descarta share_id y cualquier id interno). */
export function toSurveyView(row: SurveyResponseRow): SurveyResponseView {
  return {
    valoracion_global: row.valoracionGlobal,
    claridad_informe: row.claridadInforme,
    conforme_hallazgos: row.conformeHallazgos,
    comentario: row.comentario,
    submitted_at: row.submittedAt.toISOString()
  };
}

/** Estado de encuesta a partir de la fila (o ausencia) para el load público (R1). */
export function toSurveyState(row: SurveyResponseRow | null): SurveyState {
  if (!row) {
    return { estado: 'pendiente' };
  }
  return { estado: 'respondida', respuesta: toSurveyView(row) };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export type SubmitSurveyResult =
  | { ok: true; estado: 'respondida'; respuesta: SurveyResponseView }
  | { ok: false; reason: 'rate_limited' | 'unavailable' | 'invalid' | 'already_answered' };

/**
 * Pipeline de envío de la encuesta vía token público:
 * rate limit (R10) → resolveShareByToken (R5) → Zod (R4) → insert (R6).
 * El conflicto UNIQUE (23505) se mapea a `already_answered`, no es error 500.
 */
export async function submitSurveyResponse(input: {
  token: string;
  raw: unknown;
  clientIp: string;
}): Promise<SubmitSurveyResult> {
  if (isInformeShareRateLimited(input.clientIp)) {
    return { ok: false, reason: 'rate_limited' };
  }

  const resolution = await resolveShareByToken(input.token);
  if (!resolution.ok) {
    // Causa indistinguible hacia afuera (R5); el log server-side ya la registró.
    return { ok: false, reason: 'unavailable' };
  }

  const parsed = surveyResponseSchema.safeParse(input.raw);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid' };
  }

  try {
    const row = await insertSurveyResponse({
      shareId: resolution.share.id,
      valoracionGlobal: parsed.data.valoracion_global,
      claridadInforme: parsed.data.claridad_informe,
      conformeHallazgos: parsed.data.conforme_hallazgos,
      comentario: parsed.data.comentario
    });
    return { ok: true, estado: 'respondida', respuesta: toSurveyView(row) };
  } catch (err) {
    if (isUniqueViolation(err)) {
      logger.info('survey_response_duplicate', { shareId: resolution.share.id });
      return { ok: false, reason: 'already_answered' };
    }
    throw err;
  }
}

export { getSurveyByShareId };
