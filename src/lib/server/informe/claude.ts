import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { InformeGenerationError, InformeNotConfiguredError } from './errors';
import { reportDraftEnvelopeSchema } from './schemas';

/** Adapter de la API de Claude (R3, R8). Mockeable en tests; fake en e2e. */

export const INFORME_DEFAULT_MODEL = 'claude-opus-4-8';

export function resolveInformeModel(): string {
  return process.env.INFORME_CLAUDE_MODEL || INFORME_DEFAULT_MODEL;
}

export function assertAnthropicConfigured(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new InformeNotConfiguredError();
  }
}

export interface InformeClaudeAdapter {
  generateDraft(input: {
    prompt: { system: string; user: string };
    model: string;
  }): Promise<unknown>;
}

/** JSON schema del envelope para output_config.format (derivado de Zod, R8). */
export function buildOutputFormat(): { type: 'json_schema'; schema: Record<string, unknown> } {
  return {
    type: 'json_schema',
    schema: zodToJsonSchema(reportDraftEnvelopeSchema, { target: 'jsonSchema7' }) as Record<
      string,
      unknown
    >
  };
}

type MessagesClient = {
  messages: {
    create(params: Record<string, unknown>): Promise<{ content: unknown }>;
  };
};

export function createClaudeAdapter(deps?: { client?: MessagesClient }): InformeClaudeAdapter {
  const override = getAdapterOverride();
  if (override) {
    return override;
  }
  if (process.env.INFORME_FAKE === '1') {
    return createFakeAdapter();
  }

  return {
    async generateDraft({ prompt, model }) {
      const client =
        deps?.client ??
        (new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) as unknown as MessagesClient);

      const response = await client.messages.create({
        model,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        output_config: { format: buildOutputFormat() }
      });

      const blocks = response.content as Array<{ type: string; text?: string }>;
      const text = blocks
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('');
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new InformeGenerationError('La respuesta de la IA no es JSON válido');
      }
    }
  };
}

/** Override de adapter para tests (sin red ni credenciales, R28). */
const ADAPTER_OVERRIDE_KEY = '__auditapp_informe_adapter_override__';

function getAdapterOverride(): InformeClaudeAdapter | undefined {
  return (globalThis as Record<string, unknown>)[ADAPTER_OVERRIDE_KEY] as
    | InformeClaudeAdapter
    | undefined;
}

export function setInformeAdapterForTests(adapter: InformeClaudeAdapter | undefined): void {
  (globalThis as Record<string, unknown>)[ADAPTER_OVERRIDE_KEY] = adapter;
}

/**
 * Adapter fake para e2e (INFORME_FAKE=1): genera un envelope determinístico
 * a partir del canónico embebido en el turno user, sin llamar a la API.
 */
export function createFakeAdapter(): InformeClaudeAdapter {
  return {
    async generateDraft({ prompt }) {
      const canonical = JSON.parse(prompt.user) as {
        client: { razon_social: string };
        sections: Array<{ code: string; title: string; score: number | null }>;
      };
      const scored = canonical.sections.filter((s) => s.score !== null);
      const codes = (scored.length > 0 ? scored : canonical.sections).map((s) => s.code);
      const first = codes[0] ?? 'GEN';
      const second = codes[1] ?? first;
      const razon = canonical.client.razon_social;
      const tresFn = [
        { nombre: 'Perfiles de usuario', que_resuelve: 'limita qué puede hacer cada puesto' },
        { nombre: 'Informes Tango Live', que_resuelve: 'datos en línea sin planillas' },
        { nombre: 'Circuito de autorización', que_resuelve: 'controles antes de emitir' }
      ];
      return {
        cliente: {
          resumen: {
            diagnostico: 'El sistema funciona pero sin controles internos aplicados',
            lead: `${razon} opera su gestión con circuitos parcialmente cubiertos según el relevamiento.`,
            circuitos_con_controles: null,
            interpretacion: 'El índice refleja circuitos operativos sin controles formalizados.',
            recomendacion_central: 'ordenar circuitos y activar controles existentes',
            fortalezas: null
          },
          indices: {},
          hallazgos: {
            circuitos: codes.map((code) => ({
              seccion_code: code,
              doc: 'Parcial',
              controles: 'No',
              madurez: 'Manual'
            })),
            lectura_transversal: [
              { titulo: 'Controles manuales', detalle: 'Los circuitos dependen de planillas.' },
              { titulo: 'Sin documentación', detalle: 'No hay procedimientos escritos.' },
              { titulo: 'Datos dispersos', detalle: 'La información vive fuera del sistema.' }
            ]
          },
          riesgos: {
            intro: 'Los riesgos surgen directamente de los hallazgos del relevamiento.',
            items: [1, 2, 3, 4].map((n) => ({
              titulo: `Riesgo operativo ${n}`,
              descripcion: 'Puede generar pérdidas operativas si no se corrige.',
              evidencia: 'Relevamiento de circuitos sin control aplicado.',
              severidad: 'alta' as const
            }))
          },
          plan: {
            titulo: 'Plan de ordenamiento de circuitos',
            descripcion: 'Se ordenan los circuitos críticos y quedan controles funcionando.',
            etapas: [
              { semana: 'Sem 1', titulo: 'Relevamiento', descripcion: 'Circuitos objetivo.' },
              { semana: 'Sem 2–3', titulo: 'Parametrización', descripcion: 'Módulos y permisos.' }
            ],
            necesitamos_cliente: ['Referente del proyecto designado.'],
            no_incluye: ['Desarrollo a medida.']
          },
          dia_a_dia: {
            intro: 'No hace falta desarrollo a medida: la funcionalidad ya está en el producto.',
            circuitos: [
              { seccion_code: first, funcionalidades: tresFn },
              { seccion_code: second, funcionalidades: tresFn }
            ],
            callout_transversal: null
          },
          proximos_pasos: [
            `${razon} aprueba este informe y designa su referente.`,
            'Presentamos la propuesta comercial.',
            'Kickoff de la etapa 1.'
          ]
        },
        interna: {
          recomendaciones_presupuesto: [
            {
              linea: 'Implementación de controles internos en circuitos críticos',
              rango_estimado: 'USD 2.000–4.000',
              urgencia: 'alta',
              probabilidad_cierre: 'media',
              candidato_financiacion: false,
              candidato_abono: true,
              justificacion: 'Circuitos sin controles según relevamiento.'
            }
          ]
        }
      };
    }
  };
}
