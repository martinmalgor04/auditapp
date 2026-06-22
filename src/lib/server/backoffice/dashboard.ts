import { getSql } from '$lib/server/db/client';
import type { AuditStatus } from '$lib/server/db/audit-status';
import type { AuditType } from '$lib/audit-types';
import type { AppUser } from '$lib/server/auth/types';
import { userAuditTypesScope } from '$lib/server/auth/audit-access';
import type { DashboardAuditRow } from '$lib/backoffice/dashboard-types';
import { computeAuditProgress, type AuditProgress } from './progress';
import { canShowBriefingLink, getBriefingUrl } from './briefing-link';
import type { DashboardFilters } from './schemas';

export const DASHBOARD_PAGE_SIZE = 50;

export type { DashboardAuditRow };

export type DashboardResult = {
  rows: DashboardAuditRow[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
};

type RawRow = {
  id: string;
  name: string;
  types: AuditType[];
  segment: 'A' | 'B' | 'C';
  status: AuditStatus;
  scheduled_at: Date | null;
  razon_social: string;
  client_id: string;
  tech_name: string;
  last_activity: Date;
  public_token: string | null;
  template_ids: string[];
};

function orderClause(sort: DashboardFilters['sort']): string {
  switch (sort) {
    case 'scheduled_at_asc':
      return 'scheduled_at ASC NULLS LAST, a.created_at ASC';
    case 'scheduled_at_desc':
      return 'scheduled_at DESC NULLS LAST, a.created_at DESC';
    case 'last_activity_asc':
      return 'last_activity ASC';
    case 'last_activity_desc':
    default:
      return 'last_activity DESC';
  }
}

async function fetchProgressForAudits(
  auditIds: string[],
  templateIdsByAudit: Map<string, string[]>
): Promise<Map<string, AuditProgress>> {
  const progressMap = new Map<string, AuditProgress>();
  if (auditIds.length === 0) {
    return progressMap;
  }

  const sql = getSql();
  const allTemplateIds = [...new Set([...templateIdsByAudit.values()].flat())];

  const items =
    allTemplateIds.length > 0
      ? await sql<{ id: string; field_type: string; template_id: string }[]>`
          SELECT ti.id, ti.field_type, s.template_id
          FROM template_item ti
          JOIN section s ON s.id = ti.section_id
          WHERE s.template_id = ANY(${allTemplateIds}::uuid[])
        `
      : [];

  const itemsByTemplate = new Map<string, Array<{ id: string; field_type: string }>>();
  for (const item of items) {
    const list = itemsByTemplate.get(item.template_id) ?? [];
    list.push({ id: item.id, field_type: item.field_type });
    itemsByTemplate.set(item.template_id, list);
  }

  const responses = await sql<
    { audit_id: string; item_id: string; value: unknown; na: boolean }[]
  >`
    SELECT audit_id, item_id, value, na
    FROM audit_response
    WHERE audit_id = ANY(${auditIds}::uuid[])
  `;

  const responsesByAudit = new Map<string, Array<{ item_id: string; value: unknown; na: boolean }>>();
  for (const r of responses) {
    const list = responsesByAudit.get(r.audit_id) ?? [];
    list.push({ item_id: r.item_id, value: r.value, na: r.na });
    responsesByAudit.set(r.audit_id, list);
  }

  for (const auditId of auditIds) {
    const templateIds = templateIdsByAudit.get(auditId) ?? [];
    const auditItems = templateIds.flatMap((tid) => itemsByTemplate.get(tid) ?? []);
    const auditResponses = responsesByAudit.get(auditId) ?? [];
    progressMap.set(auditId, computeAuditProgress(auditItems, auditResponses));
  }

  return progressMap;
}

export async function listDashboardAudits(
  filters: DashboardFilters,
  viewer?: AppUser | null
): Promise<DashboardResult> {
  const sql = getSql();
  const page = filters.page ?? 1;
  const offset = (page - 1) * DASHBOARD_PAGE_SIZE;
  const order = orderClause(filters.sort ?? 'last_activity_desc');

  const typeFilter = filters.type ?? null;
  const statusFilter = filters.status ?? null;
  const clientFilter = filters.clientId ?? null;
  const qFilter = filters.q?.trim() ? `%${filters.q.trim()}%` : null;
  const scopeTypes = viewer ? userAuditTypesScope(viewer) : null;

  const [countRow] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    WHERE a.archived_at IS NULL
      AND (${scopeTypes}::text[] IS NULL OR a.types && ${scopeTypes}::text[])
      AND (${typeFilter}::text IS NULL OR ${typeFilter} = ANY(a.types))
      AND (${statusFilter}::text IS NULL OR a.status = ${statusFilter})
      AND (${clientFilter}::uuid IS NULL OR a.empresa_id = ${clientFilter})
      AND (${qFilter}::text IS NULL OR c.razon_social ILIKE ${qFilter})
  `;

  const total = Number(countRow?.count ?? 0);

  const rawRows = await sql<RawRow[]>`
    SELECT
      a.id,
      a.name,
      a.types,
      a.segment,
      a.status,
      a.scheduled_at,
      c.razon_social,
      c.id AS client_id,
      u.name AS tech_name,
      GREATEST(a.created_at, COALESCE(MAX(ar.updated_at), a.created_at)) AS last_activity,
      a.public_token,
      a.template_ids
    -- #23 Fase 1: JOIN sobre la tabla base empresa (no la vista client). La vista no expone la PK,
    -- asi que Postgres no puede inferir la dependencia funcional de c.razon_social respecto al
    -- GROUP BY c.id (error must appear in the GROUP BY clause). Sobre empresa (PK real) si.
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    JOIN app_user u ON u.id = a.assigned_tech_id
    LEFT JOIN audit_response ar ON ar.audit_id = a.id
    WHERE a.archived_at IS NULL
      AND (${scopeTypes}::text[] IS NULL OR a.types && ${scopeTypes}::text[])
      AND (${typeFilter}::text IS NULL OR ${typeFilter} = ANY(a.types))
      AND (${statusFilter}::text IS NULL OR a.status = ${statusFilter})
      AND (${clientFilter}::uuid IS NULL OR a.empresa_id = ${clientFilter})
      AND (${qFilter}::text IS NULL OR c.razon_social ILIKE ${qFilter})
    GROUP BY a.id, c.id, u.id
    ORDER BY ${sql.unsafe(order)}
    LIMIT ${DASHBOARD_PAGE_SIZE}
    OFFSET ${offset}
  `;

  const templateIdsByAudit = new Map(rawRows.map((r) => [r.id, r.template_ids]));
  const progressMap = await fetchProgressForAudits(
    rawRows.map((r) => r.id),
    templateIdsByAudit
  );

  const rows: DashboardAuditRow[] = rawRows.map((r) => ({
    id: r.id,
    name: r.name,
    types: r.types,
    segment: r.segment,
    status: r.status,
    scheduledAt: r.scheduled_at,
    razonSocial: r.razon_social,
    clientId: r.client_id,
    techName: r.tech_name,
    lastActivity: r.last_activity,
    publicToken: r.public_token,
    briefingUrl:
      r.public_token && canShowBriefingLink(r.status, r.public_token)
        ? getBriefingUrl(r.public_token)
        : null,
    templateIds: r.template_ids,
    progress: progressMap.get(r.id) ?? { completed: 0, total: 0, percent: 0 }
  }));

  return {
    rows,
    total,
    page,
    pageSize: DASHBOARD_PAGE_SIZE,
    hasNext: offset + rows.length < total
  };
}

export async function listClientsForFilter(): Promise<Array<{ id: string; razonSocial: string }>> {
  const sql = getSql();
  const rows = await sql<{ id: string; razon_social: string }[]>`
    SELECT id, razon_social
    FROM client
    ORDER BY razon_social ASC
    LIMIT 500
  `;
  return rows.map((r) => ({ id: r.id, razonSocial: r.razon_social }));
}
