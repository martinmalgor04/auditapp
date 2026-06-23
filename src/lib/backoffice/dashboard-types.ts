import type { AuditStatus } from '$lib/audit-status';
import type { AuditType } from '$lib/audit-types';
import type { AuditProgress } from '$lib/backoffice/progress-types';

export type DashboardAuditRow = {
  id: string;
  name: string;
  refCode: string;
  types: AuditType[];
  segment: 'A' | 'B' | 'C';
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
