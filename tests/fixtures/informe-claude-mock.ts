import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CanonicalAudit } from '../../src/lib/server/canonical/schema';
import type { InformeClaudeAdapter } from '../../src/lib/server/informe/claude';
import type {
  ReportClientDraft,
  ReportDraftEnvelope,
  ReportInternalDraft
} from '../../src/lib/server/informe/schemas';

/** Canónico estable para pipeline/render (T18): scores en los tres rangos de semáforo. */
export function loadInformeCanonicalGolden(): CanonicalAudit {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'tests/fixtures/informe-canonical-golden.json'), 'utf8')
  ) as CanonicalAudit;
}

const MEJORAS_IT = [
  { nombre: 'Inventario centralizado', que_resuelve: 'visibilidad de activos en toda la red' },
  { nombre: 'Política de backups 3-2-1', que_resuelve: 'recuperación ante ransomware' },
  { nombre: 'Segmentación de red', que_resuelve: 'contención de incidentes' }
];

/** Draft IT sin referencias Tango/módulos/circuito en textos visibles (#19). */
export function buildValidClientDraftIt(codes: string[]): ReportClientDraft {
  const draft = buildValidClientDraft(codes);
  draft.resumen.lead = 'El relevamiento muestra áreas IT sin controles formalizados.';
  draft.resumen.diagnostico = 'La infraestructura opera sin controles de seguridad aplicados';
  draft.resumen.interpretacion = 'El índice IT refleja madurez parcial en controles de infraestructura.';
  draft.resumen.recomendacion_central = 'reforzar controles de seguridad y backups';
  draft.plan.titulo = 'Plan de endurecimiento de infraestructura';
  draft.plan.descripcion = 'Se priorizan áreas críticas de seguridad y continuidad operativa.';
  draft.plan.etapas = [
    { semana: 'Sem 1', titulo: 'Relevamiento', descripcion: 'Áreas objetivo de infraestructura.' },
    { semana: 'Sem 2–3', titulo: 'Endurecimiento', descripcion: 'Controles de acceso y red.' },
    { semana: 'Sem 4', titulo: 'Capacitación', descripcion: 'Usuarios clave en buenas prácticas.' }
  ];
  draft.hallazgos.lectura_transversal = [
    { titulo: 'Controles manuales', detalle: 'El 80% de las áreas depende de procedimientos informales.' },
    { titulo: 'Sin documentación', detalle: 'No hay políticas escritas de seguridad.' },
    { titulo: 'Datos dispersos', detalle: 'La información crítica vive fuera de sistemas centralizados.' }
  ];
  draft.dia_a_dia = {
    intro: 'Priorizamos mejoras concretas de infraestructura según el relevamiento.',
    circuitos: codes.slice(0, 2).map((code) => ({
      seccion_code: code,
      hoy: 'área operada sin controles ni monitoreo formal',
      funcionalidades: MEJORAS_IT
    })),
    callout_transversal: 'Para la dirección — visibilidad unificada de activos y riesgos.'
  };
  draft.proximos_pasos = [
    'El cliente aprueba este informe y designa su referente.',
    'Presentamos la propuesta de infraestructura.',
    'Kickoff de la etapa 1 de seguridad.'
  ];
  return draft;
}

const FUNCIONALIDADES = [
  { nombre: 'Perfiles de usuario', que_resuelve: 'limita qué puede hacer cada puesto' },
  { nombre: 'Tango Live', que_resuelve: 'informes en línea sin planillas' },
  { nombre: 'Circuito de autorización', que_resuelve: 'controles antes de emitir comprobantes' }
];

/** Draft cliente válido contra reportClientDraftSchema, con seccion_codes dados. */
export function buildValidClientDraft(codes: string[]): ReportClientDraft {
  const c1 = codes[0] ?? 'A1';
  const c2 = codes[1] ?? c1;
  return {
    resumen: {
      diagnostico: 'El ERP funciona pero sin controles internos aplicados',
      lead: 'El relevamiento muestra circuitos operativos sin controles formalizados.',
      circuitos_con_controles: { n: 2, total: 9 },
      interpretacion: 'El índice refleja un uso parcial del sistema.',
      recomendacion_central: 'ordenar circuitos y activar los controles existentes',
      fortalezas: 'La infraestructura de servidores está al día.'
    },
    // Índices inventados a propósito: el pipeline los sobrescribe (R12).
    indices: { erp: { valor: 99, semaforo: 'green' } },
    hallazgos: {
      circuitos: codes.map((code) => ({
        seccion_code: code,
        doc: 'Parcial',
        controles: 'No',
        madurez: 'Manual'
      })),
      lectura_transversal: [
        { titulo: 'Controles manuales', detalle: 'El 80% de los circuitos depende de planillas.' },
        { titulo: 'Sin documentación', detalle: 'No hay procedimientos escritos.' },
        { titulo: 'Datos dispersos', detalle: 'La información operativa vive fuera del sistema.' }
      ]
    },
    riesgos: {
      intro: 'Los riesgos surgen directamente de los hallazgos del relevamiento.',
      items: [1, 2, 3, 4].map((n) => ({
        titulo: `Riesgo operativo ${n}`,
        descripcion: 'Puede generar pérdidas si no se corrige.',
        evidencia: 'Backup sin probar según relevamiento.',
        severidad: 'alta' as const
      }))
    },
    plan: {
      titulo: 'Plan de ordenamiento de circuitos',
      descripcion: 'Se ordenan los circuitos críticos y quedan controles funcionando.',
      etapas: [
        { semana: 'Sem 1', titulo: 'Relevamiento', descripcion: 'Circuitos objetivo.' },
        { semana: 'Sem 2–3', titulo: 'Parametrización', descripcion: 'Módulos y permisos.' },
        { semana: 'Sem 4', titulo: 'Capacitación', descripcion: 'Usuarios clave.' }
      ],
      necesitamos_cliente: ['Referente del proyecto designado.', 'Datos a migrar validados.'],
      no_incluye: ['Desarrollo a medida.', 'Integraciones con terceros.']
    },
    dia_a_dia: {
      intro: 'No hace falta desarrollo a medida: la funcionalidad ya está en el producto.',
      circuitos: [
        {
          seccion_code: c1,
          hoy: 'facturación manual, sin controles, precios fuera del sistema',
          funcionalidades: FUNCIONALIDADES
        },
        {
          seccion_code: c2,
          hoy: 'el stock del sistema no refleja el físico',
          funcionalidades: FUNCIONALIDADES
        }
      ],
      callout_transversal: 'Para la dirección — Tango Live: informes en línea.'
    },
    proximos_pasos: [
      'El cliente aprueba este informe y designa su referente.',
      'Presentamos la propuesta comercial.',
      'Kickoff de la etapa 1.'
    ]
  };
}

export function buildValidInternalDraft(): ReportInternalDraft {
  return {
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
  };
}

export function buildValidEnvelope(codes: string[]): ReportDraftEnvelope {
  return { cliente: buildValidClientDraft(codes), interna: buildValidInternalDraft() };
}

function codesFromPrompt(user: string): string[] {
  const canonical = JSON.parse(user) as CanonicalAudit;
  const scored = canonical.sections.filter((s) => s.score !== null);
  return (scored.length > 0 ? scored : canonical.sections).slice(0, 4).map((s) => s.code);
}

export type AdapterCall = { prompt: { system: string; user: string }; model: string };

/** Mock válido: arma el envelope con los codes reales del canónico del prompt. */
export function mockAdapterValid(calls: AdapterCall[] = []): InformeClaudeAdapter {
  return {
    async generateDraft(input) {
      calls.push(input);
      return buildValidEnvelope(codesFromPrompt(input.prompt.user));
    }
  };
}

/** Mock con seccion_code inexistente en el snapshot (R12). */
export function mockAdapterUnknownSection(): InformeClaudeAdapter {
  return {
    async generateDraft() {
      return buildValidEnvelope(['ZZZ_NO_EXISTE']);
    }
  };
}

/** Mock que devuelve JSON inválido contra los schemas (R13). */
export function mockAdapterInvalid(): InformeClaudeAdapter {
  return {
    async generateDraft() {
      return { cliente: { resumen: {} }, interna: {} };
    }
  };
}

/** Mock que lanza (fallo de API, R13). */
export function mockAdapterThrows(message = 'API caída'): InformeClaudeAdapter {
  return {
    async generateDraft() {
      throw new Error(message);
    }
  };
}

/** Mock colgado: promesa que nunca resuelve (R6). */
export function mockAdapterHanging(): InformeClaudeAdapter {
  return {
    generateDraft() {
      return new Promise(() => {});
    }
  };
}
