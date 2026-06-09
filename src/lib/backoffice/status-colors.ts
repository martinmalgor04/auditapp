import type { AuditStatus } from '$lib/audit-status';

export type StatusBadgeVariant = {
  bg: string;
  text: string;
};

const STATUS_COLORS: Record<AuditStatus, StatusBadgeVariant> = {
  borrador: { bg: 'bg-slate-100', text: 'text-slate-800' },
  briefing_enviado: { bg: 'bg-blue-100', text: 'text-blue-800' },
  briefing_completo: { bg: 'bg-cyan-100', text: 'text-cyan-800' },
  en_relevamiento: { bg: 'bg-amber-100', text: 'text-amber-800' },
  en_cierre: { bg: 'bg-orange-100', text: 'text-orange-800' },
  cerrada: { bg: 'bg-green-100', text: 'text-green-800' }
};

export function getStatusBadgeClasses(status: AuditStatus): string {
  const variant = STATUS_COLORS[status];
  return `${variant.bg} ${variant.text}`;
}

export function getAllStatusVariants(): Record<AuditStatus, StatusBadgeVariant> {
  return { ...STATUS_COLORS };
}
