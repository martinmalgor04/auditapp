import type { TransactionSql } from 'postgres';
import { getSql } from './client';
import {
  CRM_FUNNEL,
  type CrmFunnelStatus,
  type CrmStatus,
  assertTransition,
  pathTo
} from '$lib/server/crm/state-machine';
import {
  CrmLeadDiscardedError,
  CrmLeadNotFoundError
} from '$lib/server/crm/errors';
import type { CrmLeadBatchItem, CrmLeadCreateInput, CrmLeadUpdateInput } from '$lib/server/crm/schemas';

export type CrmLeadRow = {
  id: string;
  email: string;
  empresa: string;
  contacto: string | null;
  telefono: string | null;
  source: string;
  status: CrmStatus;
  notas: string | null;
  proximaAccion: string | null;
  proximaAccionFecha: string | null;
  clientId: string | null;
  auditId: string | null;
  presupuestoRef: string | null;
  descartadoAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CrmLeadEventRow = {
  id: string;
  leadId: string;
  fromStatus: string;
  toStatus: string;
  changedBy: string | null;
  createdAt: Date;
};

export type CrmListFilters = {
  status?: CrmStatus;
  source?: string;
  q?: string;
  includeDescartados?: boolean;
};

export type FunnelCounts = Record<CrmFunnelStatus, number>;

const LEAD_SELECT = `
  id, email, empresa, contacto, telefono, source, status,
  notas, proxima_accion, proxima_accion_fecha,
  client_id, audit_id, presupuesto_ref, descartado_at,
  created_at, updated_at
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLead(row: Record<string, any>): CrmLeadRow {
  return {
    id: row.id,
    email: row.email,
    empresa: row.empresa,
    contacto: row.contacto,
    telefono: row.telefono,
    source: row.source,
    status: row.status,
    notas: row.notas,
    proximaAccion: row.proxima_accion,
    proximaAccionFecha: row.proxima_accion_fecha
      ? String(row.proxima_accion_fecha).slice(0, 10)
      : null,
    clientId: row.client_id,
    auditId: row.audit_id,
    presupuestoRef: row.presupuesto_ref,
    descartadoAt: row.descartado_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(row: Record<string, any>): CrmLeadEventRow {
  return {
    id: row.id,
    leadId: row.lead_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedBy: row.changed_by,
    createdAt: row.created_at
  };
}

export async function listLeads(filters: CrmListFilters = {}): Promise<CrmLeadRow[]> {
  const sql = getSql();
  const conditions: string[] = [];
  const params: (string | CrmStatus)[] = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  } else if (!filters.includeDescartados) {
    conditions.push(`status <> 'descartado'`);
  }

  if (filters.source) {
    params.push(filters.source);
    conditions.push(`source = $${params.length}`);
  }

  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`(email ILIKE $${params.length} OR empresa ILIKE $${params.length})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await sql.unsafe(
    `SELECT ${LEAD_SELECT} FROM crm_lead ${where} ORDER BY updated_at DESC`,
    params
  );
  return rows.map(mapLead);
}

export async function funnelCounts(): Promise<FunnelCounts> {
  const sql = getSql();
  const rows = await sql<{ status: CrmFunnelStatus; count: string }[]>`
    SELECT status, count(*)::text AS count
    FROM crm_lead
    WHERE status <> 'descartado'
    GROUP BY status
  `;
  const counts = Object.fromEntries(CRM_FUNNEL.map((s) => [s, 0])) as FunnelCounts;
  for (const row of rows) {
    counts[row.status] = Number(row.count);
  }
  return counts;
}

export async function getLeadById(id: string): Promise<CrmLeadRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(`SELECT ${LEAD_SELECT} FROM crm_lead WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] ? mapLead(rows[0]) : null;
}

export async function createLead(
  input: CrmLeadCreateInput,
  _createdBy: string
): Promise<CrmLeadRow> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `INSERT INTO crm_lead (email, empresa, contacto, telefono, source, notas)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${LEAD_SELECT}`,
    [
      input.email,
      input.empresa,
      input.contacto ?? null,
      input.telefono ?? null,
      input.source,
      input.notas ?? null
    ]
  );
  return mapLead(rows[0]);
}

export async function upsertLeadsBatch(
  items: CrmLeadBatchItem[]
): Promise<{ inserted: number; updated: number }> {
  const sql = getSql();
  let inserted = 0;
  let updated = 0;

  await sql.begin(async (tx) => {
    for (const item of items) {
      const existing = await tx<{ id: string }[]>`
        SELECT id FROM crm_lead WHERE lower(email) = lower(${item.email}) LIMIT 1
      `;
      await tx.unsafe(
        `INSERT INTO crm_lead (email, empresa, contacto, telefono, source, notas)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ((lower(email))) DO UPDATE SET
           contacto = COALESCE(crm_lead.contacto, EXCLUDED.contacto),
           telefono = COALESCE(crm_lead.telefono, EXCLUDED.telefono),
           notas = CASE
             WHEN EXCLUDED.notas IS NOT NULL AND EXCLUDED.notas <> '' THEN
               CASE
                 WHEN crm_lead.notas IS NULL OR crm_lead.notas = '' THEN EXCLUDED.notas
                 ELSE crm_lead.notas || E'\\n' || EXCLUDED.notas
               END
             ELSE crm_lead.notas
           END,
           updated_at = now()`,
        [
          item.email,
          item.empresa,
          item.contacto ?? null,
          item.telefono ?? null,
          item.source,
          item.notas ?? null
        ]
      );
      if (existing.length > 0) {
        updated += 1;
      } else {
        inserted += 1;
      }
    }
  });

  return { inserted, updated };
}

async function insertEvent(
  tx: TransactionSql,
  leadId: string,
  fromStatus: string,
  toStatus: string,
  changedBy: string | null
): Promise<void> {
  await tx`
    INSERT INTO crm_lead_event (lead_id, from_status, to_status, changed_by)
    VALUES (${leadId}, ${fromStatus}, ${toStatus}, ${changedBy})
  `;
}

export async function changeStatus(
  id: string,
  to: CrmStatus,
  changedBy: string | null
): Promise<CrmLeadRow> {
  const sql = getSql();
  return sql.begin(async (tx) => {
    const rows = await tx.unsafe(`SELECT ${LEAD_SELECT} FROM crm_lead WHERE id = $1 FOR UPDATE`, [
      id
    ]);
    if (!rows[0]) {
      throw new CrmLeadNotFoundError(id);
    }
    const lead = mapLead(rows[0]);
    assertTransition(lead.status, to);

    const descartadoAt =
      to === 'descartado' ? new Date() : lead.status === 'descartado' && to === 'lead' ? null : lead.descartadoAt;

    const updated = await tx.unsafe(
      `UPDATE crm_lead
       SET status = $2, descartado_at = $3, updated_at = now()
       WHERE id = $1
       RETURNING ${LEAD_SELECT}`,
      [id, to, descartadoAt]
    );
    await insertEvent(tx, id, lead.status, to, changedBy);
    return mapLead(updated[0]);
  });
}

export async function updateLead(id: string, patch: CrmLeadUpdateInput): Promise<CrmLeadRow> {
  const sql = getSql();
  const sets: string[] = [];
  const params: (string | null)[] = [id];

  const fields: [keyof CrmLeadUpdateInput, string][] = [
    ['contacto', 'contacto'],
    ['telefono', 'telefono'],
    ['notas', 'notas'],
    ['proxima_accion', 'proxima_accion'],
    ['proxima_accion_fecha', 'proxima_accion_fecha'],
    ['presupuesto_ref', 'presupuesto_ref'],
    ['client_id', 'client_id']
  ];

  for (const [key, col] of fields) {
    if (key in patch) {
      params.push(patch[key] ?? null);
      sets.push(`${col} = $${params.length}`);
    }
  }

  if (sets.length === 0) {
    const lead = await getLeadById(id);
    if (!lead) {
      throw new CrmLeadNotFoundError(id);
    }
    return lead;
  }

  sets.push('updated_at = now()');
  const rows = await sql.unsafe(
    `UPDATE crm_lead SET ${sets.join(', ')} WHERE id = $1 RETURNING ${LEAD_SELECT}`,
    params
  );
  if (!rows[0]) {
    throw new CrmLeadNotFoundError(id);
  }
  return mapLead(rows[0]);
}

export async function linkAudit(
  id: string,
  auditId: string,
  changedBy: string | null
): Promise<CrmLeadRow> {
  const sql = getSql();
  const [audit] = await sql<{ id: string }[]>`SELECT id FROM audit WHERE id = ${auditId} LIMIT 1`;
  if (!audit) {
    throw new CrmLeadNotFoundError(auditId);
  }

  return sql.begin(async (tx) => {
    const rows = await tx.unsafe(`SELECT ${LEAD_SELECT} FROM crm_lead WHERE id = $1 FOR UPDATE`, [
      id
    ]);
    if (!rows[0]) {
      throw new CrmLeadNotFoundError(id);
    }
    const lead = mapLead(rows[0]);
    if (lead.status === 'descartado') {
      throw new CrmLeadDiscardedError();
    }

    const steps = pathTo(lead.status, 'auditado');
    let current = lead.status;
    for (const step of steps) {
      assertTransition(current, step);
      await tx.unsafe(
        `UPDATE crm_lead SET status = $2, updated_at = now() WHERE id = $1`,
        [id, step]
      );
      await insertEvent(tx, id, current, step, changedBy);
      current = step;
    }

    const updated = await tx.unsafe(
      `UPDATE crm_lead SET audit_id = $2, updated_at = now() WHERE id = $1 RETURNING ${LEAD_SELECT}`,
      [id, auditId]
    );
    return mapLead(updated[0]);
  });
}

export async function listLeadEvents(leadId: string): Promise<CrmLeadEventRow[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, lead_id, from_status, to_status, changed_by, created_at
    FROM crm_lead_event
    WHERE lead_id = ${leadId}
    ORDER BY created_at ASC
  `;
  return rows.map(mapEvent);
}

export async function countClients(): Promise<number> {
  const sql = getSql();
  const [row] = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM client`;
  return Number(row.count);
}
