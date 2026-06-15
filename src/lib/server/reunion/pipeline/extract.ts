import { logger } from '$lib/server/logger';
import { parseFormValue } from '$lib/server/form/schemas';
import type { FieldType } from '$lib/server/db/field-schemas';
import { reunionProposalSchema } from '../schemas';
import type { TemplateContext } from './context';

export type ExtractedProposal = {
  item_id: string;
  proposed_value: unknown;
  quote: string;
  confidence: number;
};

const MVP_FIELD_TYPES: FieldType[] = ['text', 'tri', 'select', 'number', 'bool', 'date'];

function buildExtractionPrompt(transcript: string, context: TemplateContext): string {
  const itemsJson = JSON.stringify(
    context.items.map((item) => ({
      item_id: item.item_id,
      label: item.label,
      field_type: item.field_type,
      options: item.options,
      current_value: item.current_value ?? null
    })),
    null,
    2
  );

  return `Sos un asistente de auditoría IT. Tu tarea es extraer valores de la conversación de reunión y mapearlos a los ítems de la plantilla de auditoría.

ÍTEMS DISPONIBLES (solo proponer para estos):
${itemsJson}

REGLAS:
- Solo proponer valores para los item_id listados arriba.
- Solo proponer si hay evidencia textual clara en el transcript (incluir cita obligatoriamente).
- confidence entre 0.0 y 1.0 según certeza de la extracción.
- proposed_value debe ser del tipo correcto para el field_type:
  - text: string
  - number: number
  - bool: true o false
  - tri: "si", "no" o "parcial"
  - select: uno de los valores en options.choices
  - date: string formato YYYY-MM-DD
- No inventar ítems, no inventar valores.
- Omitir un ítem si no hay evidencia suficiente.

TRANSCRIPT:
${transcript}

Respondé ÚNICAMENTE con un array JSON (sin texto adicional, sin markdown):
[{"item_id": "uuid", "proposed_value": <valor>, "quote": "cita textual", "confidence": 0.85}]

Si no hay nada que proponer, respondé: []`;
}

export async function extractProposals(
  transcript: string,
  context: TemplateContext
): Promise<ExtractedProposal[]> {
  if (context.items.length === 0) {
    return [];
  }

  const model = process.env.REUNION_LLM_MODEL ?? 'gpt-4o-mini';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY no configurado');
  }

  const prompt = buildExtractionPrompt(transcript, context);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 2000
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const raw = data.choices[0]?.message?.content?.trim() ?? '[]';

  let parsed: unknown[];
  try {
    parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      parsed = [];
    }
  } catch {
    logger.warn('reunion_extract_parse_error', { raw: raw.slice(0, 200) });
    return [];
  }

  const results: ExtractedProposal[] = [];

  for (const item of parsed) {
    const validation = reunionProposalSchema.safeParse(item);
    if (!validation.success) {
      logger.warn('reunion_proposal_schema_invalid', { item, errors: validation.error.issues });
      continue;
    }

    const proposal = validation.data;

    // Validar proposed_value con el parser de form por field_type
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
      results.push({
        item_id: proposal.item_id,
        proposed_value: validValue,
        quote: proposal.quote,
        confidence: proposal.confidence
      });
    } catch {
      logger.warn('reunion_proposal_value_invalid', {
        item_id: proposal.item_id,
        value: proposal.proposed_value
      });
    }
  }

  return results;
}

/** Mock para tests — retorna propuestas predefinidas. */
export async function extractProposalsMock(
  _transcript: string,
  context: TemplateContext,
  overrides?: ExtractedProposal[]
): Promise<ExtractedProposal[]> {
  if (overrides) return overrides;
  // Retorna una propuesta para el primer ítem elegible
  const first = context.items[0];
  if (!first) return [];
  return [
    {
      item_id: first.item_id,
      proposed_value: first.field_type === 'bool' ? true : 'Mock valor',
      quote: 'El cliente mencionó esto en la reunión',
      confidence: 0.85
    }
  ];
}
