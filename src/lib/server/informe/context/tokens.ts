/** Estimador determinístico chars/4 (R7, R14). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Recorta items completos desde el final hasta cumplir presupuesto. */
export function trimToBudget<T>(
  items: T[],
  getText: (item: T) => string,
  budget: number
): { kept: T[]; discarded: number } {
  const kept = [...items];
  let discarded = 0;
  while (kept.length > 0) {
    const total = estimateTokens(kept.map(getText).join('\n\n'));
    if (total <= budget) {
      break;
    }
    kept.pop();
    discarded++;
  }
  return { kept, discarded };
}
