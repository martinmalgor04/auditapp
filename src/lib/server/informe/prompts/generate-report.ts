import type { CanonicalAudit } from '$lib/server/canonical/schema';
import type { InformeContext } from '../context/schemas';
import {
  formatCatalogoBlock,
  formatFewshotBlock,
  formatRagBlock
} from '../context/build';

/** Prompt versionado del informe IA (R9, R12). */
export const INFORME_PROMPT_VERSION = '2.0';

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

const SYSTEM_PROMPT_CLIENTE = `
## Salida
Respondé ÚNICAMENTE con un JSON válido conforme al envelope { "cliente": ..., "interna": ... }. Nada de texto fuera del JSON.

## Reglas para la salida "cliente" (informe que ve el cliente)
- Tono: español rioplatense profesional, SIN voseo hacia el cliente final. Concreto, sin promesas absolutas.
- "resumen.diagnostico": el diagnóstico central en UNA línea (máximo 90 caracteres, cabe en un h2).
- "resumen.circuitos_con_controles": si no hay evidencia suficiente en el relevamiento para estimar cuántos circuitos tienen controles internos aplicados, devolvé null (el render muestra un placeholder «a editar» que completa el equipo en revisión).
- Los valores numéricos de índices que escribas son informativos: el sistema los sobrescribe siempre con el cálculo determinístico.
- Dimensiones Doc. / Controles / Madurez por circuito: inferilas SOLO de los items y observations de cada sección del canónico, con valores cortos («Sí», «No», «Parcial», «Manual», etc.). Sin evidencia → «—». Usá el seccion_code exacto del canónico.
- "hallazgos.lectura_transversal": 3 a 4 observaciones que crucen varios circuitos, con evidencia numérica del relevamiento.
- Riesgos: 4 por defecto (grid 2×2 del template), 3 a 5 si la evidencia lo justifica. Cada riesgo con "evidencia" citando un dato concreto del relevamiento, nunca inventada. Insumo: top_risks.
- Plan: timeline de 2 a 6 etapas con semana corta («Sem 1», «Sem 4–5»), más qué necesitamos del cliente y qué no incluye. Insumos: next_step y quick_wins.
- "dia_a_dia": 2 a 4 circuitos débiles (score bajo) con exactamente 3 funcionalidades Tango existentes cada uno; usá seccion_code del canónico.
- "proximos_pasos": 3 a 5 ítems; usá la razón social del cliente donde el template la pide.`;

const SYSTEM_PROMPT_INTERNA = `
## Reglas para la salida "interna" (recomendaciones de presupuesto, solo uso interno SyS)
- Las recomendaciones internas sugieren líneas de solución y rangos de precio estimados.
- NUNCA fijar marca, modelo ni producto específico cerrado. Solo líneas de solución y rangos.
- Incluí urgencia, probabilidad de cierre, candidato a financiación y candidato a abono recurrente con su justificación.`;

const JERGA_BLOCK = `
## Jerga prohibida
No uses NUNCA, en ningún texto del informe, los siguientes términos: «solución 360°», «disruptivo», «excelencia», «de la mano de», «transformación digital», «world class».`;

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
    SYSTEM_PROMPT_CLIENTE +
    JERGA_BLOCK;

  return {
    system,
    user: JSON.stringify(canonical)
  };
}
