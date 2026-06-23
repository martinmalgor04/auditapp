export const AUDIT_TYPES = ['it', 'erp-tango', 'erp-estandar'] as const;

export type AuditType = (typeof AUDIT_TYPES)[number];

export const AUDIT_TYPE_LABELS: Record<AuditType, string> = {
  it: 'IT',
  'erp-tango': 'ERP Tango',
  'erp-estandar': 'ERP Estándar'
};

/** Token corto para ref_code (#41, R6). */
export const TYPE_REF_TOKEN: Record<AuditType, 'IT' | 'ERP' | 'ERPE'> = {
  it: 'IT',
  'erp-tango': 'ERP',
  'erp-estandar': 'ERPE'
};

export function refTokenForType(type: AuditType): 'IT' | 'ERP' | 'ERPE' {
  return TYPE_REF_TOKEN[type];
}

export function parseAuditTypes(values: string[]): AuditType[] {
  const allowed = new Set<string>(AUDIT_TYPES);
  return values.filter((v): v is AuditType => allowed.has(v));
}
