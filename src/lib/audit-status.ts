export const AUDIT_STATUSES = [
  'borrador',
  'briefing_enviado',
  'briefing_completo',
  'en_relevamiento',
  'en_cierre',
  'cerrada'
] as const;

export type AuditStatus = (typeof AUDIT_STATUSES)[number];

const FORM_OPEN_STATUSES: AuditStatus[] = ['briefing_completo', 'en_relevamiento', 'en_cierre'];
const CLOSURE_OPEN_STATUSES: AuditStatus[] = ['en_cierre', 'cerrada'];

export function canOpenForm(status: AuditStatus): boolean {
  return FORM_OPEN_STATUSES.includes(status);
}

export function canOpenClosure(status: AuditStatus): boolean {
  return CLOSURE_OPEN_STATUSES.includes(status);
}
