import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  analyzeProposalsWith,
  type AnalyzeConfig,
  type AnthropicMessage
} from '../src/lib/server/reunion/pipeline/analyze';
import { normalizeQuote } from '../src/lib/server/reunion/pipeline/grounding';
import type { TemplateContext } from '../src/lib/server/reunion/pipeline/context';

const TRANSCRIPT = readFileSync(
  join(process.cwd(), 'tests/fixtures/reunion-transcripcion-prueba.txt'),
  'utf8'
);

// Ítems de la plantilla involucrados en la reunión de prueba.
const ITEM_ERP = '10000000-0000-0000-0000-000000000001';
const ITEM_PASSWORD_POLICY = '10000000-0000-0000-0000-000000000002';
const ITEM_BACKUPS = '10000000-0000-0000-0000-000000000003';
const ITEM_RESTORE = '10000000-0000-0000-0000-000000000004';
const ITEM_EMPLEADOS = '10000000-0000-0000-0000-000000000005';
// Ítems alucinados (el cliente NUNCA habló de estos controles puntuales).
const ITEM_CAPACITACION = '20000000-0000-0000-0000-000000000001';
const ITEM_ENDURECIMIENTO = '20000000-0000-0000-0000-000000000002';
const ITEM_FIREWALL_DOC = '20000000-0000-0000-0000-000000000003';
const ITEM_RUBRO = '20000000-0000-0000-0000-000000000004';

const HALLUCINATED = [ITEM_CAPACITACION, ITEM_ENDURECIMIENTO, ITEM_FIREWALL_DOC, ITEM_RUBRO];

function item(id: string, label: string, field_type: string): TemplateContext['items'][number] {
  return {
    item_id: id,
    label,
    section_title: 'Seguridad',
    help_text: null,
    field_type,
    options: field_type === 'tri' ? { choices: ['si', 'no', 'parcial'] } : null,
    filled_by: 'cliente',
    current_value: null
  };
}

const CONTEXT: TemplateContext = {
  items: [
    item(ITEM_ERP, '¿Usa ERP?', 'text'),
    item(ITEM_PASSWORD_POLICY, '¿Política de contraseñas?', 'tri'),
    item(ITEM_BACKUPS, '¿Backups automáticos?', 'tri'),
    item(ITEM_RESTORE, '¿Restauración probada?', 'tri'),
    item(ITEM_EMPLEADOS, 'Cantidad de empleados', 'number'),
    item(ITEM_CAPACITACION, '¿Capacitación en ciberseguridad?', 'tri'),
    item(ITEM_ENDURECIMIENTO, '¿Endurecimiento de servidores?', 'tri'),
    item(ITEM_FIREWALL_DOC, '¿Reglas de firewall documentadas?', 'tri'),
    item(ITEM_RUBRO, 'Rubro de la empresa', 'text')
  ]
};

// Cita verbatim de la política de contraseñas (substring exacto del transcript real).
const PASSWORD_QUOTE =
  'No, cada uno pone la que quiere. Hay gente que tiene la misma contraseña desde que arrancó la empresa hace ocho años.';
// Cita verbatim de la respuesta de restauración (substring exacto del transcript real).
const RESTORE_QUOTE = 'La verdad que no, nunca lo probamos. Asumimos que funciona.';

// Stub determinístico que reproduce la salida CRUDA observada del LLM, con los 4 patrones de error:
// (A) ítems alucinados con citas inventadas/de la postura general; (B) la cita de contraseñas
// reusada en 3 ítems; (C) backups leído como "no"/negativo citando la respuesta de restauración
// ("nunca lo probamos", que en realidad responde a restore); más las propuestas correctas.
// Todas las citas "reales" son substrings VERBATIM del fixture; las inventadas deben caer por guards.
const RAW_PROPOSALS = [
  // Correctas
  { item_id: ITEM_ERP, proposed_value: 'Tango', quote: 'el principal donde corre el Tango', confidence: 0.95 },
  { item_id: ITEM_BACKUPS, proposed_value: 'si', quote: 'Hacemos backup todos los días a las once de la noche', confidence: 0.92 },
  { item_id: ITEM_RESTORE, proposed_value: 'no', quote: RESTORE_QUOTE, confidence: 0.9 },
  { item_id: ITEM_EMPLEADOS, proposed_value: 45, quote: 'Somos 45 personas en total', confidence: 0.9 },
  // (B) cita de contraseñas reusada en 3 ítems distintos
  { item_id: ITEM_PASSWORD_POLICY, proposed_value: 'no', quote: PASSWORD_QUOTE, confidence: 0.85 },
  { item_id: ITEM_CAPACITACION, proposed_value: 'no', quote: PASSWORD_QUOTE, confidence: 0.6 },
  { item_id: ITEM_ENDURECIMIENTO, proposed_value: 'no', quote: PASSWORD_QUOTE, confidence: 0.55 },
  // (A) ítems alucinados con citas que NO existen en el transcript (caen por grounding)
  { item_id: ITEM_FIREWALL_DOC, proposed_value: 'no', quote: 'no tienen reglas de firewall documentadas', confidence: 0.7 },
  // rubro inferido del saludo: la cita existe pero confidence < umbral (cae por threshold)
  { item_id: ITEM_RUBRO, proposed_value: 'Industria metalúrgica', quote: 'gracias por recibirnos', confidence: 0.4 },
  // (C) lectura negativa de backups citando la respuesta de restauración (cae por dedup vs RESTORE)
  { item_id: ITEM_BACKUPS, proposed_value: 'no', quote: RESTORE_QUOTE, confidence: 0.5 }
];

const CONFIG: AnalyzeConfig = {
  model: 'claude-sonnet-4-6',
  confidenceMin: 0.5,
  verifierEnabled: false,
  verifierModel: 'claude-haiku-4-5'
};

function stubResponse(): AnthropicMessage {
  return { content: [{ type: 'tool_use', name: 'propose_values', input: { proposals: RAW_PROPOSALS } }] };
}

describe('regresión con la transcripción de prueba (R16)', () => {
  it('tras los guards: sin ítems alucinados, sin reuso de cita, backups no negativo', async () => {
    const transport = vi.fn(async () => stubResponse());
    const result = await analyzeProposalsWith(TRANSCRIPT, CONTEXT, CONFIG, transport);
    const byItem = new Map(result.map((p) => [p.item_id, p]));

    // (a) ningún item_id alucinado sobrevive
    for (const id of HALLUCINATED) {
      expect(byItem.has(id)).toBe(false);
    }

    // (b) ninguna cita normalizada se repite entre ítems
    const quotes = result.map((p) => normalizeQuote(p.quote));
    expect(new Set(quotes).size).toBe(quotes.length);

    // la cita de contraseñas, si sobrevive, está en un solo ítem (el de mayor confidence: política)
    const passwordHolders = result.filter(
      (p) => normalizeQuote(p.quote) === normalizeQuote(PASSWORD_QUOTE)
    );
    expect(passwordHolders.length).toBeLessThanOrEqual(1);
    if (passwordHolders.length === 1) {
      expect(passwordHolders[0].item_id).toBe(ITEM_PASSWORD_POLICY);
    }

    // (c) backups no queda con valor negativo
    const backups = byItem.get(ITEM_BACKUPS);
    expect(backups).toBeDefined();
    expect(backups?.proposed_value).toBe('si');
    expect(backups?.proposed_value).not.toBe('no');
  });
});
