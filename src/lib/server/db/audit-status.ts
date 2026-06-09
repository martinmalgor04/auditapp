export const AUDIT_STATUSES = [
  'borrador',
  'briefing_enviado',
  'briefing_completo',
  'en_relevamiento',
  'en_cierre',
  'cerrada'
] as const;

export type AuditStatus = (typeof AUDIT_STATUSES)[number];

const STATUS_SET = new Set<string>(AUDIT_STATUSES);

/** Transiciones válidas sin contexto adicional. */
const BASE_TRANSITIONS: Record<AuditStatus, AuditStatus[]> = {
  borrador: ['briefing_enviado', 'en_relevamiento'],
  briefing_enviado: ['briefing_completo', 'en_relevamiento'],
  briefing_completo: ['en_relevamiento'],
  en_relevamiento: ['en_cierre'],
  en_cierre: ['cerrada'],
  cerrada: []
};

export function isValidAuditStatus(value: string): value is AuditStatus {
  return STATUS_SET.has(value);
}

export function isValidAuditStatusTransition(
  from: AuditStatus,
  to: AuditStatus,
  opts?: { allowAdminReopen?: boolean; skipBriefing?: boolean }
): boolean {
  if (from === to) {
    return true;
  }

  if (from === 'cerrada' && to === 'en_cierre') {
    return opts?.allowAdminReopen === true;
  }

  const allowed = BASE_TRANSITIONS[from];
  if (allowed.includes(to)) {
    return true;
  }

  if (opts?.skipBriefing && from === 'borrador' && to === 'en_relevamiento') {
    return true;
  }

  return false;
}

/** Estados desde los cuales el briefing del cliente sigue editable. */
export function isBriefingEditable(status: AuditStatus): boolean {
  return status === 'briefing_enviado' || status === 'briefing_completo';
}
