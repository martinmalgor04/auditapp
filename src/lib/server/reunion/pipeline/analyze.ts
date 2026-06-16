import { logger } from '$lib/server/logger';
import { parseFormValue } from '$lib/server/form/schemas';
import type { FieldType } from '$lib/server/db/field-schemas';
import { analysisProposalsSchema } from '../schemas';
import type { TemplateContext } from './context';
import {
  dedupeByQuote,
  dropBelowThreshold,
  dropUngrounded,
  type GuardableProposal
} from './grounding';
import { verifyProposals } from './verify';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const MVP_FIELD_TYPES: FieldType[] = ['text', 'tri', 'select', 'number', 'bool', 'date'];

/** R19 — marcador de verificación; null/undefined cuando el verificador está off o no aplica. */
export type VerificationStatus = 'verified' | 'unverified' | null;

export type AnalyzedProposal = {
  item_id: string;
  proposed_value: unknown;
  quote: string;
  confidence: number;
  verification_status?: VerificationStatus;
};

export type AnalyzeConfig = {
  model: string; // REUNION_ANALYSIS_MODEL ?? 'claude-sonnet-4-6'   (R4)
  confidenceMin: number; // REUNION_CONFIDENCE_MIN ?? 0.5            (R10)
  verifierEnabled: boolean; // REUNION_VERIFIER_ENABLED === 'true'   (R12/R13)
  verifierModel: string; // REUNION_VERIFIER_MODEL ?? 'claude-haiku-4-5' (R12)
};

/** Bloque de respuesta de la Messages API (forma mínima que usamos). */
export type AnthropicContentBlock = {
  type: string;
  name?: string;
  input?: unknown;
  text?: string;
};

export type AnthropicMessage = {
  content: AnthropicContentBlock[];
};

/** Transport inyectable para tests: envuelve el POST a /v1/messages. */
export type AnthropicTransport = (body: unknown) => Promise<AnthropicMessage>;

/** Tool schema forzado de extracción (R3, R7). */
export const PROPOSE_VALUES_TOOL = {
  name: 'propose_values',
  description:
    'Devuelve sólo las propuestas con evidencia textual explícita para el control puntual del ítem.',
  input_schema: {
    type: 'object',
    properties: {
      proposals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            item_id: { type: 'string', description: 'UUID exacto de un ítem del contexto' },
            proposed_value: { description: 'Valor del tipo correcto según field_type' },
            quote: {
              type: 'string',
              description: 'Cita textual verbatim del transcript que responde ESTA pregunta'
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 }
          },
          required: ['item_id', 'proposed_value', 'quote', 'confidence']
        }
      }
    },
    required: ['proposals']
  }
} as const;

/** Lee config de análisis desde env con defaults (R4, R10, R12, R13). */
export function readAnalyzeConfig(): AnalyzeConfig {
  const rawMin = process.env.REUNION_CONFIDENCE_MIN;
  let confidenceMin = 0.5;
  if (rawMin !== undefined && rawMin !== '') {
    const parsed = Number(rawMin);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      confidenceMin = parsed;
    }
  }
  return {
    model: process.env.REUNION_ANALYSIS_MODEL || 'claude-sonnet-4-6',
    confidenceMin,
    verifierEnabled: process.env.REUNION_VERIFIER_ENABLED === 'true',
    verifierModel: process.env.REUNION_VERIFIER_MODEL || 'claude-haiku-4-5'
  };
}

/** Prompt endurecido (R6, R7). Las directivas se chequean textualmente en tests. */
export function buildAnalysisPrompt(transcript: string, context: TemplateContext): string {
  const itemsJson = JSON.stringify(
    context.items.map((item) => ({
      item_id: item.item_id,
      label: item.label,
      section_title: item.section_title,
      help_text: item.help_text ?? null,
      field_type: item.field_type,
      options: item.options,
      current_value: item.current_value ?? null
    })),
    null,
    2
  );

  return `Sos un asistente de auditoría IT. Tu tarea es extraer valores de la conversación de reunión y mapearlos a los ítems de la plantilla, usando la herramienta propose_values.

ÍTEMS DISPONIBLES (solo proponer para estos item_id):
${itemsJson}

REGLAS ESTRICTAS:
- Solo proponer valores para los item_id listados arriba. No inventar ítems.
- PROHIBIDO inferir un valor a partir de controles vecinos o de la postura general de seguridad del cliente. Que el cliente tenga una mala postura de seguridad NO habilita proponer capacitación, endurecimiento de servidores, reglas de firewall documentadas, ni el rubro de la empresa.
- Si el cliente NO habló del control puntual de un ítem, OMITIR ese ítem: no se propone valor.
- Cada propuesta DEBE incluir una cita textual verbatim del transcript que responda ESA pregunta puntual del ítem. No citar saludos, ni la respuesta a otra pregunta, ni fragmentos de otra parte de la conversación.
- No reusar la misma cita para ítems distintos.
- proposed_value debe ser del tipo correcto para el field_type:
  - text: string
  - number: number
  - bool: true o false
  - tri: "si", "no" o "parcial"
  - select: uno de los valores en options.choices
  - date: string formato YYYY-MM-DD
- Calibrar confidence (0.0–1.0): alto sólo con evidencia explícita y directa; bajo u omitir ante ambigüedad.

TRANSCRIPT:
${transcript}

Devolvé el resultado únicamente mediante la herramienta propose_values. Si no hay nada que proponer, devolvé proposals: [].`;
}

/** Lee las propuestas del bloque tool_use de propose_values, sin parsear texto libre (R3). */
function readToolUseProposals(message: AnthropicMessage): GuardableProposal[] {
  if (!message || !Array.isArray(message.content)) {
    logger.warn('reunion_analysis_no_tool_use', { reason: 'no_content' });
    return [];
  }
  const block = message.content.find(
    (b) => b.type === 'tool_use' && b.name === 'propose_values'
  );
  if (!block) {
    logger.warn('reunion_analysis_no_tool_use', { reason: 'no_tool_use_block' });
    return [];
  }
  const parsed = analysisProposalsSchema.safeParse(block.input);
  if (!parsed.success) {
    logger.warn('reunion_analysis_no_tool_use', { reason: 'invalid_input' });
    return [];
  }
  // proposed_value es z.unknown() (clave opcional en zod) → normalizar a GuardableProposal.
  return parsed.data.proposals.map((p) => ({
    item_id: p.item_id,
    proposed_value: p.proposed_value,
    quote: p.quote,
    confidence: p.confidence
  }));
}

/**
 * R14 paso 1 — validación de tipo por field_type (parser de form de #12).
 * Una propuesta inválida por tipo (o de un ítem desconocido / field_type no soportado)
 * se descarta acá, antes de grounding.
 */
function validateByFieldType(
  props: GuardableProposal[],
  context: TemplateContext
): GuardableProposal[] {
  const results: GuardableProposal[] = [];
  for (const proposal of props) {
    const contextItem = context.items.find((ci) => ci.item_id === proposal.item_id);
    if (!contextItem) {
      logger.warn('reunion_proposal_unknown_item', { item_id: proposal.item_id });
      continue;
    }
    if (!MVP_FIELD_TYPES.includes(contextItem.field_type as FieldType)) {
      logger.warn('reunion_proposal_unsupported_field_type', {
        item_id: proposal.item_id,
        field_type: contextItem.field_type
      });
      continue;
    }
    try {
      const validValue = parseFormValue(
        contextItem.field_type as FieldType,
        contextItem.options,
        proposal.proposed_value,
        false
      );
      results.push({ ...proposal, proposed_value: validValue });
    } catch {
      logger.warn('reunion_proposal_value_invalid', {
        item_id: proposal.item_id,
        value: proposal.proposed_value
      });
    }
  }
  return results;
}

/**
 * Orquesta los guards en el orden R14 sobre propuestas crudas:
 * 1. validateByFieldType → 2. dropUngrounded → 3. dropBelowThreshold → 4. dedupeByQuote
 * → 5. verify (si verifierEnabled).
 */
export async function applyGuards(
  rawProposals: GuardableProposal[],
  transcript: string,
  context: TemplateContext,
  config: AnalyzeConfig,
  transport: AnthropicTransport
): Promise<AnalyzedProposal[]> {
  const typed = validateByFieldType(rawProposals, context);
  const grounded = dropUngrounded(typed, transcript).kept;
  const aboveThreshold = dropBelowThreshold(grounded, config.confidenceMin).kept;
  const deduped = dedupeByQuote(aboveThreshold).kept;

  const survivors: AnalyzedProposal[] = deduped.map((p) => ({
    item_id: p.item_id,
    proposed_value: p.proposed_value,
    quote: p.quote,
    confidence: p.confidence
  }));

  if (!config.verifierEnabled) {
    return survivors; // R13 — sin verificador, ninguna llamada extra.
  }
  return verifyProposals(transcript, context, survivors, config, transport);
}

/** Núcleo testeable: usa un transport inyectable (R17). */
export async function analyzeProposalsWith(
  transcript: string,
  context: TemplateContext,
  config: AnalyzeConfig,
  transport: AnthropicTransport
): Promise<AnalyzedProposal[]> {
  if (context.items.length === 0) {
    return [];
  }

  const prompt = buildAnalysisPrompt(transcript, context);
  const message = await transport({
    model: config.model,
    max_tokens: 4000,
    tools: [PROPOSE_VALUES_TOOL],
    tool_choice: { type: 'tool', name: 'propose_values' },
    messages: [{ role: 'user', content: prompt }]
  });

  const raw = readToolUseProposals(message);
  return applyGuards(raw, transcript, context, config, transport);
}

/** Transport real: fetch crudo a la Messages API de Anthropic (R2, R5). */
function createFetchTransport(): AnthropicTransport {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY no configurado');
  }
  return async (body: unknown) => {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Analysis API error ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as AnthropicMessage;
  };
}

/** Entrypoint que usa direct.ts: arma el transport real y delega en analyzeProposalsWith. */
export async function analyzeProposals(
  transcript: string,
  context: TemplateContext,
  config?: AnalyzeConfig
): Promise<AnalyzedProposal[]> {
  if (context.items.length === 0) {
    return [];
  }
  const cfg = config ?? readAnalyzeConfig();
  const transport = createFetchTransport(); // lanza si falta ANTHROPIC_API_KEY (R5)
  return analyzeProposalsWith(transcript, context, cfg, transport);
}
