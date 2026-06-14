import type { CanonicalAudit } from '$lib/server/canonical/schema';
import type { InformeContext } from '../context/schemas';
import {
  formatCatalogoBlock,
  formatFewshotBlock,
  formatRagBlock
} from '../context/build';
import { tipoAuditoria, type TipoAuditoria } from '../tipo';

/** Prompt versionado del informe IA (R9, R12, #19 R8). */
export const INFORME_PROMPT_VERSION = '2.1';

export const JERGA_PROHIBIDA = [
  'solución 360°',
  'disruptivo',
  'excelencia',
  'de la mano de',
  'transformación digital',
  'world class'
] as const;

const SYSTEM_PROMPT_BASE = `Sos un consultor IT senior de Servicios y Sistemas SRL (SyS), empresa con más de 30 años en el NEA argentino, redactando el informe de una auditoría de infraestructura IT / ERP Tango para un cliente.

## Insumo
En el turno user recibís el JSON canónico completo de la auditoría cerrada: datos del cliente, secciones con scores, observaciones e items, índices, top_risks, quick_wins, upsell_findings, next_step y market_data.`;

const SYSTEM_PROMPT_CLIENTE_ERP = `
## Reglas para la salida "cliente" (informe que ve el cliente)
- Tono: español rioplatense profesional, SIN voseo hacia el cliente final. Concreto, sin promesas absolutas.
- "resumen.diagnostico": el diagnóstico central en UNA línea (máximo 90 caracteres, cabe en un h2).
- "resumen.circuitos_con_controles": si no hay evidencia suficiente en el relevamiento para estimar cuántos circuitos tienen controles internos aplicados, devolvé null (el render muestra un placeholder «a editar» que completa el equipo en revisión).
- Los valores numéricos de índices que escribas son informativos: el sistema los sobrescribe siempre con el cálculo determinístico.
- Dimensiones Doc. / Controles / Madurez por circuito: inferilas SOLO de los items y observations de cada sección del canónico, con valores cortos («Sí», «No», «Parcial», «Manual», etc.). Sin evidencia → «—». Usá el seccion_code exacto del canónico.
- "hallazgos.lectura_transversal": 3 a 4 observaciones que crucen varios circuitos, con evidencia numérica del relevamiento.
- Riesgos: 4 por defecto (grid 2×2 del template), 3 a 5 si la evidencia lo justifica. Cada riesgo con "evidencia" citando un dato concreto del relevamiento, nunca inventada. Insumo: top_risks.
- Plan: timeline de 2 a 6 etapas con semana corta («Sem 1», «Sem 4–5»), más qué necesitamos del cliente y qué no incluye. Insumos: next_step y quick_wins.
- "dia_a_dia": 2 a 4 circuitos débiles (score bajo) con exactamente 3 funcionalidades Tango existentes cada uno; usá seccion_code del canónico. Cada circuito incluye "hoy": UNA línea (máx. 100 caracteres) que describe el estado actual problemático del circuito según el relevamiento (ej. «facturación manual, sin controles, precios fuera del sistema»); sin evidencia suficiente devolvé null.
- "proximos_pasos": 3 a 5 ítems; usá la razón social del cliente donde el template la pide.`;

const SYSTEM_PROMPT_CLIENTE_IT = `
## Reglas para la salida "cliente" (informe IT puro)
- Tono: español rioplatense profesional, SIN voseo hacia el cliente final. Concreto, sin promesas absolutas.
- "resumen.diagnostico": el diagnóstico central en UNA línea (máximo 90 caracteres).
- "resumen.circuitos_con_controles": si no hay evidencia para estimar cuántas áreas tienen controles internos aplicados, devolvé null.
- Los índices los sobrescribe el sistema; usá seccion_code de áreas IT (A1–A14).
- Dimensiones Doc. / Controles / Madurez por área IT: inferilas SOLO del relevamiento. Sin evidencia → «—».
- "hallazgos.lectura_transversal": 3 a 4 observaciones transversales sobre infraestructura, seguridad, backups o redes.
- Riesgos: 3 a 5 con evidencia concreta del relevamiento. Insumo: top_risks.
- Plan: 2 a 6 etapas orientadas a infraestructura/seguridad.
- "dia_a_dia": 2 a 4 áreas IT débiles con exactamente 3 mejoras concretas de infraestructura/seguridad/backups/redes cada una (campo funcionalidades con nombre + que_resuelve). PROHIBIDO proponer funcionalidades Tango. Cada área incluye "hoy": UNA línea (máx. 100 caracteres) con el estado actual problemático según el relevamiento; sin evidencia devolvé null.
- "proximos_pasos": 3 a 5 ítems accionables.`;

const SYSTEM_PROMPT_CLIENTE_MIXTA = `
## Reglas para la salida "cliente" (auditoría IT + ERP mixta)
- Tono: español rioplatense profesional, SIN voseo hacia el cliente final.
- "resumen.diagnostico": diagnóstico central en UNA línea (máximo 90 caracteres).
- "resumen.circuitos_con_controles": null si no hay evidencia; el render muestra «a editar».
- Usá seccion_code de AMBOS templates (áreas IT A1–A14 y circuitos ERP).
- "hallazgos.lectura_transversal": 3 a 6 observaciones cross-dominio (IT y ERP).
- Riesgos: 3 a 6 en un único ranking cross-dominio, con evidencia del relevamiento.
- Plan: timeline unificado de 2 a 6 etapas cubriendo ambos dominios.
- "dia_a_dia.circuitos": 2 a 6 entradas — áreas IT con 3 mejoras de infraestructura/seguridad (sin Tango) y circuitos ERP con 3 funcionalidades Tango existentes cada uno, según el dominio del seccion_code. Cada entrada incluye "hoy": UNA línea (máx. 100 caracteres) con el estado actual problemático según el relevamiento; sin evidencia devolvé null.
- "proximos_pasos": 3 a 5 ítems.`;

const SYSTEM_PROMPT_INTERNA = `
## Reglas para la salida "interna" (recomendaciones de presupuesto, solo uso interno SyS)
- Las recomendaciones internas sugieren líneas de solución y rangos de precio estimados.
- NUNCA fijar marca, modelo ni producto específico cerrado. Solo líneas de solución y rangos.
- Incluí urgencia, probabilidad de cierre, candidato a financiación y candidato a abono recurrente con su justificación.`;

const JERGA_BLOCK = `
## Jerga prohibida
No uses NUNCA, en ningún texto del informe, los siguientes términos: «solución 360°», «disruptivo», «excelencia», «de la mano de», «transformación digital», «world class».`;

function clienteBlockFor(tipo: TipoAuditoria): string {
  if (tipo === 'it') return SYSTEM_PROMPT_CLIENTE_IT;
  if (tipo === 'mixta') return SYSTEM_PROMPT_CLIENTE_MIXTA;
  return SYSTEM_PROMPT_CLIENTE_ERP;
}

/** Sufijos deterministas por fuente inyectada (R12). */
export function resolvePromptVersion(context: InformeContext | null): string {
  let version = INFORME_PROMPT_VERSION;
  if (!context) {
    return version;
  }
  const { injected } = context.meta;
  if (injected.rag) {
    version += '+rag';
  }
  if (injected.catalogo) {
    version += '+catalogo';
  }
  if (injected.fewshot) {
    version += '+fewshot';
  }
  return version;
}

function buildContextBlocks(context: InformeContext | undefined): string {
  if (!context) {
    return '';
  }
  const parts: string[] = [];

  if (context.meta.injected.rag && context.rag?.chunks.length) {
    parts.push(
      `<contexto_tango>\nFragmentos de webinars Tango en Directo (Axoft) relevantes a los hallazgos:\n${formatRagBlock(context.rag.chunks)}\n</contexto_tango>`
    );
  }

  if (context.meta.injected.catalogo && context.catalogo?.lineas.length) {
    parts.push(
      `<catalogo_sys>\nCatálogo SyS v${context.catalogo.version} — usar SOLO para recomendaciones internas. Rangos orientativos por línea; sin producto cerrado ni precio puntual:\n${formatCatalogoBlock(context.catalogo.lineas)}\n</catalogo_sys>`
    );
  }

  if (context.meta.injected.fewshot && context.fewshot?.examples.length) {
    parts.push(
      `<ejemplos>\nInformes aprobados ejemplares (tono y estructura de referencia):\n${formatFewshotBlock(context.fewshot.examples)}\n</ejemplos>`
    );
  }

  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

export function buildInformePrompt(
  canonical: CanonicalAudit,
  context?: InformeContext
): {
  system: string;
  user: string;
} {
  const tipo = tipoAuditoria(canonical.types);
  const catalogoRule =
    context?.meta.injected.catalogo
      ? '\n- El bloque <catalogo_sys> es EXCLUSIVO de la salida interna; no lo menciones ni uses en el texto cliente.'
      : '';

  const system =
    SYSTEM_PROMPT_BASE +
    buildContextBlocks(context) +
    SYSTEM_PROMPT_INTERNA +
    (context?.meta.injected.catalogo
      ? '\n- Usá el catálogo SyS como insumo de rangos orientativos en recomendaciones internas, sin nombrar producto cerrado.'
      : '') +
    catalogoRule +
    clienteBlockFor(tipo) +
    JERGA_BLOCK +
    `\n\n## Formato de salida\nRespondé ÚNICAMENTE con el objeto JSON sin ningún texto adicional, sin bloques de código markdown ni explicaciones. Usá EXACTAMENTE esta estructura de claves (sin agregar ni renombrar):

\`\`\`
{
  "cliente": {
    "resumen": {
      "diagnostico": "string",
      "lead": "string",
      "circuitos_con_controles": { "n": 0, "total": 0 } | null,
      "interpretacion": "string",
      "recomendacion_central": "string",
      "fortalezas": "string" | null
    },
    "indices": { "erp": { "valor": 0, "semaforo": "green|amber|red" } | undefined, "it": { "valor": 0, "semaforo": "green|amber|red" } | undefined },
    "hallazgos": {
      "circuitos": [{ "seccion_code": "string", "doc": "string", "controles": "string", "madurez": "string" }],
      "lectura_transversal": [{ "titulo": "string", "detalle": "string" }]
    },
    "riesgos": {
      "intro": "string",
      "items": [{ "titulo": "string", "descripcion": "string", "evidencia": "string", "severidad": "baja|media|alta|critica" }]
    },
    "plan": {
      "titulo": "string",
      "descripcion": "string",
      "etapas": [{ "semana": "string", "titulo": "string", "descripcion": "string" }],
      "necesitamos_cliente": ["string"],
      "no_incluye": ["string"]
    },
    "dia_a_dia": {
      "intro": "string",
      "circuitos": [{ "seccion_code": "string", "hoy": "string" | null, "funcionalidades": [{ "nombre": "string", "que_resuelve": "string" }] }],
      "callout_transversal": "string" | null
    },
    "proximos_pasos": ["string"]
  },
  "interna": {
    "recomendaciones_presupuesto": [{
      "linea": "string",
      "rango_estimado": "string",
      "urgencia": "baja|media|alta",
      "probabilidad_cierre": "baja|media|alta",
      "candidato_financiacion": true|false,
      "candidato_abono": true|false,
      "justificacion": "string"
    }]
  }
}
\`\`\``;

  return {
    system,
    user: JSON.stringify(canonical)
  };
}
