export const AUDIT_TYPES = ['it', 'erp-tango', 'erp-estandar'] as const;

export type AuditType = (typeof AUDIT_TYPES)[number];

export const AUDIT_TYPE_LABELS: Record<AuditType, string> = {
  it: 'IT',
  'erp-tango': 'ERP Tango',
  'erp-estandar': 'ERP Estándar'
};

export function parseAuditTypes(values: string[]): AuditType[] {
  const allowed = new Set<string>(AUDIT_TYPES);
  return values.filter((v): v is AuditType => allowed.has(v));
}
