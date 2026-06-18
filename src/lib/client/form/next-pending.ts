import { itemStatus } from './item-status';

export type PendingTarget = {
  sectionId: string;
  sectionIndex: number;
  itemId: string;
  itemIndex: number;
};

/**
 * Encuentra el próximo ítem pendiente.
 * Busca desde el ítem siguiente al lastVisitedItemIndex dentro de la sección
 * activa, luego en las secciones siguientes, luego en las anteriores (circular).
 * Devuelve null si no hay ningún pendiente (R11).
 * Cubre R9–R13.
 */
export function nextPending(
  sections: Array<{
    id: string;
    items: Array<{ id: string; value: unknown; na: boolean; notes?: string | null }>;
  }>,
  activeSectionIndex: number,
  lastVisitedItemIndex: number
): PendingTarget | null {
  const n = sections.length;

  // Buscar dentro de la sección activa, desde lastVisitedItemIndex+1 en adelante
  const active = sections[activeSectionIndex];
  if (active) {
    for (let i = lastVisitedItemIndex + 1; i < active.items.length; i++) {
      if (itemStatus(active.items[i]) === 'pendiente') {
        return {
          sectionId: active.id,
          sectionIndex: activeSectionIndex,
          itemId: active.items[i].id,
          itemIndex: i
        };
      }
    }
  }

  // Secciones siguientes, luego anteriores (circular, R12)
  for (let offset = 1; offset < n; offset++) {
    const idx = (activeSectionIndex + offset) % n;
    const sec = sections[idx];
    for (let i = 0; i < sec.items.length; i++) {
      if (itemStatus(sec.items[i]) === 'pendiente') {
        return {
          sectionId: sec.id,
          sectionIndex: idx,
          itemId: sec.items[i].id,
          itemIndex: i
        };
      }
    }
  }

  // La sección activa desde el inicio (ítems antes de lastVisitedItemIndex)
  if (active) {
    for (let i = 0; i <= lastVisitedItemIndex; i++) {
      if (itemStatus(active.items[i]) === 'pendiente') {
        return {
          sectionId: active.id,
          sectionIndex: activeSectionIndex,
          itemId: active.items[i].id,
          itemIndex: i
        };
      }
    }
  }

  return null; // no quedan pendientes (R11)
}
