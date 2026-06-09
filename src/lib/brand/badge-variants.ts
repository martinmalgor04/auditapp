import type { AuditStatus } from '$lib/audit-status';

export type SysBadgeVariant = 'green' | 'red' | 'amber' | 'neutral';

const SEMAPHORE_CLASSES: Record<SysBadgeVariant, string> = {
  green: 'bg-sys-verde/15 text-sys-verde',
  red: 'bg-sys-rojo/15 text-sys-rojo',
  amber: 'bg-sys-naranja/15 text-sys-naranja',
  neutral: 'bg-sys-neutro/15 text-sys-medio'
};

export function getSysBadgeClasses(variant: SysBadgeVariant): string {
  return `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SEMAPHORE_CLASSES[variant]}`;
}

const AUDIT_STATUS_VARIANTS: Record<AuditStatus, SysBadgeVariant> = {
  borrador: 'neutral',
  briefing_enviado: 'neutral',
  briefing_completo: 'green',
  en_relevamiento: 'amber',
  en_cierre: 'amber',
  cerrada: 'green'
};

export function getAuditStatusBadgeVariant(status: AuditStatus): SysBadgeVariant {
  return AUDIT_STATUS_VARIANTS[status];
}

export function getAuditStatusBadgeClasses(status: AuditStatus): string {
  return getSysBadgeClasses(getAuditStatusBadgeVariant(status));
}

export function getAllAuditStatusBadgeVariants(): Record<AuditStatus, SysBadgeVariant> {
  return { ...AUDIT_STATUS_VARIANTS };
}
