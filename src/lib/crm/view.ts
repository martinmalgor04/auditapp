export const CRM_FUNNEL = [
  'lead',
  'contactado',
  'agendo',
  'auditado',
  'presupuestado',
  'cliente'
] as const;

export type CrmFunnelStatus = (typeof CRM_FUNNEL)[number];
export type CrmStatus = CrmFunnelStatus | 'descartado';

export const CRM_STATUS_LABELS: Record<CrmStatus, string> = {
  lead: 'Lead',
  contactado: 'Contactado',
  agendo: 'Agendó',
  auditado: 'Auditado',
  presupuestado: 'Presupuestado',
  cliente: 'Cliente',
  descartado: 'Descartado'
};

export const CRM_SOURCE_LABELS: Record<string, string> = {
  firecrawl: 'Firecrawl',
  referido: 'Referido',
  manual: 'Manual',
  otro: 'Otro'
};
