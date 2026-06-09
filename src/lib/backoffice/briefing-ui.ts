import type { AuditStatus } from '$lib/audit-status';

export function canShowBriefingLink(status: AuditStatus, publicToken: string | null): boolean {
  if (!publicToken) {
    return false;
  }
  return (
    status === 'briefing_enviado' ||
    status === 'briefing_completo' ||
    status === 'borrador'
  );
}
