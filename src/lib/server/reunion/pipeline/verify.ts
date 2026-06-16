import { logger } from '$lib/server/logger';
import type { AnalyzeConfig, AnalyzedProposal, AnthropicMessage, AnthropicTransport } from './analyze';
import type { TemplateContext } from './context';

/** Tool schema forzado del juez (R12): dictamina si la cita sustenta el valor. */
export const JUDGE_TOOL = {
  name: 'judge',
  description:
    'Dictamina si la cita textual sustenta el valor propuesto para ESA pregunta puntual del ítem.',
  input_schema: {
    type: 'object',
    properties: {
      supported: {
        type: 'boolean',
        description: 'true si la cita sustenta el valor para esa pregunta exacta; false si no.'
      },
      reason: { type: 'string', description: 'Justificación breve del dictamen.' }
    },
    required: ['supported', 'reason']
  }
} as const;

function buildVerifyPrompt(
  transcript: string,
  item: { label: string; help_text: string | null },
  proposedValue: unknown,
  quote: string
): string {
  const pregunta = item.help_text ? `${item.label} — ${item.help_text}` : item.label;
  return `Sos un verificador estricto de extracción de auditoría. Te doy el transcript de una reunión, la pregunta de un ítem, un valor propuesto para esa pregunta y una cita textual del transcript.

Tu tarea: decidir si la CITA sustenta el VALOR PROPUESTO para ESA pregunta exacta. No para preguntas vecinas ni para la postura general del cliente: solo para esta pregunta puntual.

- Si la cita responde directamente la pregunta y respalda el valor → supported = true.
- Si la cita es de otro tema, no responde la pregunta, o no respalda el valor → supported = false.

PREGUNTA DEL ÍTEM:
${pregunta}

VALOR PROPUESTO:
${JSON.stringify(proposedValue)}

CITA:
"${quote}"

TRANSCRIPT:
${transcript}`;
}

function readJudgeResult(message: AnthropicMessage): { supported: boolean; reason: string } | null {
  if (!message || !Array.isArray(message.content)) return null;
  const block = message.content.find(
    (b) => b.type === 'tool_use' && b.name === 'judge'
  );
  const input = block?.input as { supported?: unknown; reason?: unknown } | undefined;
  if (!input || typeof input.supported !== 'boolean') return null;
  return { supported: input.supported, reason: typeof input.reason === 'string' ? input.reason : '' };
}

/**
 * R12/R19 — verificador Tier 2. Por cada propuesta, una llamada al juez.
 * - supported=false → descartar (log reunion_proposal_verifier_drop).
 * - supported=true  → conservar con verification_status='verified'.
 * - ERROR del juez en esa propuesta (red/API/timeout, sin dictamen) → conservar con
 *   verification_status='unverified' (log reunion_proposal_verifier_error); el error se captura
 *   por propuesta y NO interrumpe el juicio del resto.
 */
export async function verifyProposals(
  transcript: string,
  context: TemplateContext,
  props: AnalyzedProposal[],
  config: AnalyzeConfig,
  transport: AnthropicTransport
): Promise<AnalyzedProposal[]> {
  const kept: AnalyzedProposal[] = [];

  for (const p of props) {
    const item = context.items.find((ci) => ci.item_id === p.item_id);
    const prompt = buildVerifyPrompt(
      transcript,
      { label: item?.label ?? p.item_id, help_text: item?.help_text ?? null },
      p.proposed_value,
      p.quote
    );

    try {
      const message = await transport({
        model: config.verifierModel,
        max_tokens: 1024,
        tools: [JUDGE_TOOL],
        tool_choice: { type: 'tool', name: 'judge' },
        messages: [{ role: 'user', content: prompt }]
      });

      const verdict = readJudgeResult(message);
      if (verdict === null) {
        // Sin dictamen legible → tratar como error del juez (conservar + marcar).
        logger.warn('reunion_proposal_verifier_error', {
          item_id: p.item_id,
          reason: 'no_judge_verdict'
        });
        kept.push({ ...p, verification_status: 'unverified' });
        continue;
      }

      if (verdict.supported) {
        kept.push({ ...p, verification_status: 'verified' });
      } else {
        logger.warn('reunion_proposal_verifier_drop', {
          item_id: p.item_id,
          reason: verdict.reason.slice(0, 200)
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('reunion_proposal_verifier_error', { item_id: p.item_id, error: msg });
      kept.push({ ...p, verification_status: 'unverified' });
    }
  }

  return kept;
}
