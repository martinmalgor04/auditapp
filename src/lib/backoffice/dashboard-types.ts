import type { AuditStatus } from '$lib/audit-status';
import type { AuditProgress } from '$lib/backoffice/progress-types';

export type DashboardAuditRow = {
  id: string;
  name: string;
  types: string[];
  segment: string;
  status: AuditStatus;
  scheduledAt: Date | null;
  razonSocial: string;
  clientId: string;
  techName: string;
  lastActivity: Date;
  publicToken: string | null;
  briefingUrl: string | null;
  templateIds: string[];
  progress: AuditProgress;
};
