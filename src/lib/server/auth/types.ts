export type UserRole = 'admin' | 'tecnico';

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
};

export type BriefingAuditContext = {
  auditId: string;
  clientId: string;
  status: 'briefing_enviado' | 'briefing_completo';
  publicToken: string;
};
