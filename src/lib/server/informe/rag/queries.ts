import type { CanonicalAudit } from '$lib/server/canonical/schema';

export const RAG_QUERY_CIRCUITS = 3;

export type ModuloTango =
  | 'ventas'
  | 'compras'
  | 'stock'
  | 'contabilidad'
  | 'tesoreria'
  | 'capital-humano'
  | 'impositivos'
  | 'generales'
  | 'venta-online'
  | 'cadenas';

export type RagQuery = {
  text: string;
  seccion_code: string;
  modulo: ModuloTango | null;
};

/** Mapeo seccion_code ERP seed → filtro módulo RAG (R4). Sin entrada → null. */
export const SECCION_TO_MODULO: Record<string, ModuloTango | undefined> = {
  B1: 'generales',
  B2: 'ventas',
  B3: 'compras',
  B4: 'stock',
  B5: 'tesoreria',
  B6: 'capital-humano',
  B8: 'venta-online',
  B9: 'generales',
  E1: 'generales',
  E2: 'ventas',
  E3: 'compras',
  E4: 'stock',
  E5: 'contabilidad',
  E6: 'generales',
  E7: 'generales',
  E8: 'venta-online'
};

function observationLines(section: CanonicalAudit['sections'][number]): string[] {
  const lines: string[] = [];
  if (section.observations?.trim()) {
    lines.push(section.observations.trim());
  }
  for (const item of section.items) {
    if (item.observations?.trim()) {
      lines.push(item.observations.trim());
    }
    if (item.attachments.length > 0) {
      lines.push(`Evidencia adjunta en ${item.label}`);
    }
  }
  return lines;
}

/** Top circuitos de menor score + observaciones con evidencia (R3). */
export function buildRagQueries(canonical: CanonicalAudit): RagQuery[] {
  const scored = canonical.sections
    .filter((s) => s.score !== null && s.score !== undefined)
    .sort((a, b) => (a.score as number) - (b.score as number))
    .slice(0, RAG_QUERY_CIRCUITS);

  return scored.map((section) => {
    const obs = observationLines(section);
    const obsText = obs.length > 0 ? obs.join('. ') : 'Sin observaciones detalladas';
    const text = `${section.title} (${section.code}): score ${section.score}. ${obsText}`;
    return {
      text,
      seccion_code: section.code,
      modulo: SECCION_TO_MODULO[section.code] ?? null
    };
  });
}

export function resolveModuloForSeccion(code: string): ModuloTango | null {
  return SECCION_TO_MODULO[code] ?? null;
}
