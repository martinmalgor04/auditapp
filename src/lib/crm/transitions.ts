import { CRM_FUNNEL, type CrmFunnelStatus, type CrmStatus } from '$lib/crm/view';

export type { CrmFunnelStatus, CrmStatus };
export { CRM_FUNNEL };

export function nextStatuses(from: CrmStatus): CrmStatus[] {
  const options: CrmStatus[] = [];
  if (from !== 'descartado') {
    options.push('descartado');
  }
  if (from === 'descartado') {
    options.push('lead');
    return options;
  }
  const idx = CRM_FUNNEL.indexOf(from as CrmFunnelStatus);
  if (idx >= 0 && idx < CRM_FUNNEL.length - 1) {
    options.unshift(CRM_FUNNEL[idx + 1]);
  }
  return options;
}
