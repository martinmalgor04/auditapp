import { CRM_FUNNEL, type CrmFunnelStatus, type CrmStatus } from '$lib/crm/view';
import { CrmInvalidTransitionError } from './errors';

export type { CrmFunnelStatus, CrmStatus };
export { CRM_FUNNEL };

export function canTransition(from: CrmStatus, to: CrmStatus): boolean {
  if (from === to) {
    return false;
  }
  if (from === 'descartado' && to === 'lead') {
    return true;
  }
  if (to === 'descartado' && from !== 'descartado') {
    return true;
  }
  const fromIdx = CRM_FUNNEL.indexOf(from as CrmFunnelStatus);
  const toIdx = CRM_FUNNEL.indexOf(to as CrmFunnelStatus);
  if (fromIdx === -1 || toIdx === -1) {
    return false;
  }
  return toIdx === fromIdx + 1;
}

export function assertTransition(from: CrmStatus, to: CrmStatus): void {
  if (!canTransition(from, to)) {
    throw new CrmInvalidTransitionError(from, to);
  }
}

/** Pasos secuenciales hacia `to` (incluye destino). Vacío si ya está en o después de `to`. */
export function pathTo(from: CrmStatus, to: CrmFunnelStatus): CrmFunnelStatus[] {
  if (from === 'descartado') {
    return [];
  }
  const fromIdx = CRM_FUNNEL.indexOf(from as CrmFunnelStatus);
  const toIdx = CRM_FUNNEL.indexOf(to);
  if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) {
    return [];
  }
  return CRM_FUNNEL.slice(fromIdx + 1, toIdx + 1) as unknown as CrmFunnelStatus[];
}
