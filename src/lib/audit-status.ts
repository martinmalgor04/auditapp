export const AUDIT_STATUSES = [
  'borrador',
  'briefing_enviado',
  'briefing_completo',
  'en_relevamiento',
  'en_cierre',
  'cerrada'
] as const;

export type AuditStatus = (typeof AUDIT_STATUSES)[number];
