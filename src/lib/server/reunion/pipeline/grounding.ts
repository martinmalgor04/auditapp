import { logger } from '$lib/server/logger';

/** Propuesta cruda/analizada con los 4 campos núcleo (más opcionales del verificador). */
export type GuardableProposal = {
  item_id: string;
  proposed_value: unknown;
  quote: string;
  confidence: number;
};

export type GuardResult<T> = {
  kept: T[];
  dropped: T[];
};

/** Normaliza una cita: trim + colapsa espacios en blanco + minúsculas (R8). */
export function normalizeQuote(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * R8 — grounding: la cita normalizada debe ser substring del transcript normalizado
 * con la misma función de normalización.
 */
export function isGrounded(quote: string, transcript: string): boolean {
  const q = normalizeQuote(quote);
  if (q.length === 0) return false;
  return normalizeQuote(transcript).includes(q);
}

/** R8 — descarta propuestas cuya cita no aparece en el transcript; loguea cada descarte. */
export function dropUngrounded<T extends GuardableProposal>(
  props: T[],
  transcript: string
): GuardResult<T> {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const p of props) {
    if (isGrounded(p.quote, transcript)) {
      kept.push(p);
    } else {
      dropped.push(p);
      logger.warn('reunion_proposal_grounding_fail', {
        item_id: p.item_id,
        quote: p.quote.slice(0, 200)
      });
    }
  }
  return { kept, dropped };
}

/** R10 — descarta propuestas con confidence estrictamente menor al umbral; loguea cada descarte. */
export function dropBelowThreshold<T extends GuardableProposal>(
  props: T[],
  min: number
): GuardResult<T> {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const p of props) {
    if (p.confidence >= min) {
      kept.push(p);
    } else {
      dropped.push(p);
      logger.warn('reunion_proposal_below_threshold', {
        item_id: p.item_id,
        confidence: p.confidence,
        min
      });
    }
  }
  return { kept, dropped };
}

/**
 * R9 — dedup de citas: si dos o más propuestas comparten la misma cita normalizada
 * (para ítems distintos o iguales), sobrevive la de mayor confidence. En empate, gana
 * la de menor item_id (orden estable y determinístico). Los descartes se loguean.
 */
export function dedupeByQuote<T extends GuardableProposal>(props: T[]): GuardResult<T> {
  const groups = new Map<string, T[]>();
  // Preserva orden de aparición para grupos; dentro del grupo ordenamos al elegir ganador.
  for (const p of props) {
    const key = normalizeQuote(p.quote);
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }

  const kept: T[] = [];
  const dropped: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    const winner = [...group].sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0;
    })[0];
    for (const p of group) {
      if (p === winner) {
        kept.push(p);
      } else {
        dropped.push(p);
        logger.warn('reunion_proposal_dedup_drop', {
          item_id: p.item_id,
          quote: p.quote.slice(0, 200),
          confidence: p.confidence,
          winner_item_id: winner.item_id,
          winner_confidence: winner.confidence
        });
      }
    }
  }
  return { kept, dropped };
}
