import type { AuditType } from '$lib/audit-types';

export type UserRole = 'admin' | 'tecnico';

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  /** Especialidades del técnico; null/[] = ve todos los tipos. Ignorado para admin. */
  auditTypes: AuditType[] | null;
};

export type BriefingAuditContext = {
  auditId: string;
  clientId: string;
  status: 'briefing_enviado' | 'briefing_completo';
  publicToken: string;
};
