import type { AuditStatus } from '$lib/audit-status';

export type { AuditStatus };

export interface AuditListItem {
  id: string;
  ref_code: string;
  client_name: string;
  status: AuditStatus;
  types: string[];
  segment?: string;
  progress: number; // 0–100
  assigned_tech_name?: string;
  scheduled_at?: string;
  score_low?: boolean;
}
