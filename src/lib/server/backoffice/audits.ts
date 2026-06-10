import {
  applyCabDefaultsToItems,
  cabResponsesToClientPatch,
  clientToCabValues,
  isEmptyCabValue,
  mergeCabResponses,
  newClientToCabFields,
  type ClientCabFields
} from '$lib/backoffice/cab-client-map';
import { getSql } from '$lib/server/db/client';
import type postgres from 'postgres';

type DbExecutor = postgres.Sql | postgres.TransactionSql;
import type { AuditStatus } from '$lib/server/db/audit-status';
import {
  AuditClosedError,
  AuditNotFoundError,
  ForbiddenError,
  ValidationError
} from './errors';
import { createAuditSchema, updateAuditSchema, type CreateAuditInput, type UpdateAuditInput } from './schemas';
import { computeAuditProgress, type AuditProgress } from './progress';

const TYPE_TO_TEMPLATE_CODE: Record<string, string> = {
  it: 'it',
  'erp-tango': 'erp-tango',
  'erp-estandar': 'erp-estandar'
};

export type AuditDetail = {
  id: string;
  name: string;
  clientId: string;
  razonSocial: string;
  types: string[];
  segment: string;
  status: AuditStatus;
  assignedTechId: string | null;
  techName: string | null;
  scheduledAt: Date | null;
  publicToken: string | null;
  templateIds: string[];
  archivedAt: Date | null;
  progress: AuditProgress;
  cabItems: Array<{
    id: string;
    label: string;
    fieldType: string;
    filledBy: string;
    required: boolean;
    options: Record<string, unknown>;
    value: unknown;
    na: boolean;
  }>;
};

type AuditRow = {
  id: string;
  name: string;
  client_id: string;
  razon_social: string;
  types: string[];
  segment: string;
  status: AuditStatus;
  assigned_tech_id: string | null;
  tech_name: string | null;
  scheduled_at: Date | null;
  public_token: string | null;
  template_ids: string[];
  archived_at: Date | null;
};

export async function resolveTemplateIdsForTypes(types: string[]): Promise<string[]> {
  const sql = getSql();
  const codes = types.map((t) => TYPE_TO_TEMPLATE_CODE[t]).filter(Boolean);

  if (codes.length !== types.length) {
    throw new ValidationError('Tipo de auditoría inválido');
  }

  const rows = await sql<{ id: string; code: string }[]>`
    SELECT id, code
    FROM template
    WHERE status = 'active'
      AND code = ANY(${codes})
  `;

  const byCode = new Map(rows.map((r) => [r.code, r.id]));
  const ids: string[] = [];
  for (const code of codes) {
    const id = byCode.get(code);
    if (!id) {
      throw new ValidationError(`No hay plantilla activa para ${code}`);
    }
    ids.push(id);
  }

  return ids;
}

type ClientCabRow = {
  razon_social: string;
  cuit: string | null;
  rubro: string | null;
  empleados: number | null;
  referente_nombre: string | null;
  referente_contacto: string | null;
  erp_actual: string | null;
  proveedor_correo: string | null;
  soporte_it_actual: string | null;
};

function mapClientRow(row: ClientCabRow): ClientCabFields {
  return {
    razonSocial: row.razon_social,
    cuit: row.cuit,
    rubro: row.rubro,
    empleados: row.empleados,
    referenteNombre: row.referente_nombre,
    referenteContacto: row.referente_contacto,
    erpActual: row.erp_actual,
    proveedorCorreo: row.proveedor_correo,
    soporteItActual: row.soporte_it_actual
  };
}

export async function getClientCabFields(clientId: string): Promise<ClientCabFields | null> {
  const sql = getSql();
  const [row] = await sql<ClientCabRow[]>`
    SELECT
      razon_social, cuit, rubro, empleados,
      referente_nombre, referente_contacto,
      erp_actual, proveedor_correo, soporte_it_actual
    FROM client
    WHERE id = ${clientId}
    LIMIT 1
  `;

  return row ? mapClientRow(row) : null;
}

async function syncClientFromCab(
  tx: DbExecutor,
  clientId: string,
  cabItems: Array<{ id: string; label: string; fieldType: string }>,
  cabResponses: Record<string, unknown>
): Promise<void> {
  const patch = cabResponsesToClientPatch(cabItems, cabResponses);
  if (Object.keys(patch).length === 0) {
    return;
  }

  await tx`
    UPDATE client
    SET
      razon_social = COALESCE(${patch.razonSocial ?? null}, razon_social),
      cuit = COALESCE(${patch.cuit ?? null}, cuit),
      rubro = COALESCE(${patch.rubro ?? null}, rubro),
      empleados = COALESCE(${patch.empleados ?? null}, empleados),
      referente_nombre = COALESCE(${patch.referenteNombre ?? null}, referente_nombre),
      referente_contacto = COALESCE(${patch.referenteContacto ?? null}, referente_contacto),
      erp_actual = COALESCE(${patch.erpActual ?? null}, erp_actual),
      proveedor_correo = COALESCE(${patch.proveedorCorreo ?? null}, proveedor_correo),
      soporte_it_actual = COALESCE(${patch.soporteItActual ?? null}, soporte_it_actual),
      updated_at = now()
    WHERE id = ${clientId}
  `;
}

async function upsertCabResponses(
  tx: DbExecutor,
  auditId: string,
  templateIds: string[],
  cabResponses: Record<string, unknown>,
  userId: string
): Promise<void> {
  if (Object.keys(cabResponses).length === 0) {
    return;
  }

  const cabItems = await tx<{ id: string }[]>`
    SELECT ti.id
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE s.template_id = ANY(${templateIds}::uuid[])
      AND s.code = 'CAB'
  `;

  const validIds = new Set(cabItems.map((i) => i.id));

  for (const [itemId, value] of Object.entries(cabResponses)) {
    if (!validIds.has(itemId)) {
      continue;
    }
    await tx`
      INSERT INTO audit_response (audit_id, item_id, value, source, updated_by)
      VALUES (
        ${auditId},
        ${itemId},
        ${tx.json(value as never)},
        'admin',
        ${userId}
      )
      ON CONFLICT (audit_id, item_id) DO UPDATE SET
        value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
    `;
  }
}

export async function createAudit(
  input: CreateAuditInput,
  createdBy: string
): Promise<{ id: string }> {
  const parsed = createAuditSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.errors[0]?.message ?? 'Datos inválidos');
  }

  const data = parsed.data;
  const sql = getSql();
  const templateIds = await resolveTemplateIdsForTypes(data.types);
  const scheduledAt = new Date(data.scheduledAt);
  const cabItems = await getCabItemsForTypes(data.types);

  return sql.begin(async (tx) => {
    let clientId = data.clientId;
    let clientFields: ClientCabFields | null = null;

    if (data.newClient) {
      const [client] = await tx<{ id: string }[]>`
        INSERT INTO client (razon_social, cuit, rubro)
        VALUES (
          ${data.newClient.razonSocial},
          ${data.newClient.cuit || null},
          ${data.newClient.rubro || null}
        )
        RETURNING id
      `;
      clientId = client.id;
      clientFields = newClientToCabFields(data.newClient);
    }

    if (!clientId) {
      throw new ValidationError('Cliente requerido');
    }

    if (!clientFields) {
      const [clientRow] = await tx<ClientCabRow[]>`
        SELECT
          razon_social, cuit, rubro, empleados,
          referente_nombre, referente_contacto,
          erp_actual, proveedor_correo, soporte_it_actual
        FROM client
        WHERE id = ${clientId}
      `;
      clientFields = clientRow ? mapClientRow(clientRow) : null;
    }

    const cabDefaults = clientFields
      ? clientToCabValues(clientFields, cabItems, scheduledAt)
      : {};
    const mergedCabResponses = mergeCabResponses(cabDefaults, data.cabResponses);

    const [clientRow] = await tx<{ razon_social: string }[]>`
      SELECT razon_social FROM client WHERE id = ${clientId}
    `;

    const name = `Auditoría ${clientRow.razon_social}`;

    const [audit] = await tx<{ id: string }[]>`
      INSERT INTO audit (
        client_id, name, types, template_ids, segment, status,
        assigned_tech_id, created_by, scheduled_at
      )
      VALUES (
        ${clientId},
        ${name},
        ${data.types},
        ${templateIds}::uuid[],
        ${data.segment},
        'borrador',
        ${data.assignedTechId},
        ${createdBy},
        ${scheduledAt}
      )
      RETURNING id
    `;

    await upsertCabResponses(tx, audit.id, templateIds, mergedCabResponses, createdBy);
    await syncClientFromCab(tx, clientId, cabItems, mergedCabResponses);

    return { id: audit.id };
  });
}

export async function getAuditById(auditId: string): Promise<AuditDetail | null> {
  const sql = getSql();

  const [row] = await sql<AuditRow[]>`
    SELECT
      a.id, a.name, a.client_id, c.razon_social, a.types, a.segment, a.status,
      a.assigned_tech_id, u.name AS tech_name, a.scheduled_at, a.public_token,
      a.template_ids, a.archived_at
    FROM audit a
    JOIN client c ON c.id = a.client_id
    LEFT JOIN app_user u ON u.id = a.assigned_tech_id
    WHERE a.id = ${auditId}
    LIMIT 1
  `;

  if (!row || row.archived_at) {
    return null;
  }

  const cabItems = await sql<
    {
      id: string;
      label: string;
      field_type: string;
      filled_by: string;
      required: boolean;
      options: Record<string, unknown>;
      value: unknown;
      na: boolean;
    }[]
  >`
    SELECT
      ti.id, ti.label, ti.field_type, ti.filled_by, ti.required, ti.options,
      COALESCE(ar.value, 'null'::jsonb) AS value,
      COALESCE(ar.na, false) AS na
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    LEFT JOIN audit_response ar ON ar.item_id = ti.id AND ar.audit_id = ${auditId}
    WHERE s.template_id = ANY(${row.template_ids}::uuid[])
      AND s.code = 'CAB'
    ORDER BY s.sort_order, ti.sort_order
  `;

  const allItems = await sql<{ id: string; field_type: string }[]>`
    SELECT ti.id, ti.field_type
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE s.template_id = ANY(${row.template_ids}::uuid[])
  `;

  const responses = await sql<{ item_id: string; value: unknown; na: boolean }[]>`
    SELECT item_id, value, na
    FROM audit_response
    WHERE audit_id = ${auditId}
  `;

  const progress = computeAuditProgress(allItems, responses);

  const [clientRow] = await sql<ClientCabRow[]>`
    SELECT
      razon_social, cuit, rubro, empleados,
      referente_nombre, referente_contacto,
      erp_actual, proveedor_correo, soporte_it_actual
    FROM client
    WHERE id = ${row.client_id}
  `;

  const mappedCabItems = cabItems.map((i) => ({
    id: i.id,
    label: i.label,
    fieldType: i.field_type,
    filledBy: i.filled_by,
    required: i.required,
    options: i.options,
    value: isEmptyCabValue(i.value) ? null : i.value,
    na: i.na
  }));

  const cabItemsWithDefaults = clientRow
    ? applyCabDefaultsToItems(mappedCabItems, mapClientRow(clientRow), row.scheduled_at)
    : mappedCabItems;

  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    razonSocial: row.razon_social,
    types: row.types,
    segment: row.segment,
    status: row.status,
    assignedTechId: row.assigned_tech_id,
    techName: row.tech_name,
    scheduledAt: row.scheduled_at,
    publicToken: row.public_token,
    templateIds: row.template_ids,
    archivedAt: row.archived_at,
    progress,
    cabItems: cabItemsWithDefaults
  };
}

export async function updateAudit(
  auditId: string,
  input: UpdateAuditInput,
  userId: string
): Promise<void> {
  const parsed = updateAuditSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.errors[0]?.message ?? 'Datos inválidos');
  }

  const sql = getSql();
  const audit = await getAuditById(auditId);
  if (!audit) {
    throw new AuditNotFoundError();
  }
  if (audit.status === 'cerrada') {
    throw new AuditClosedError();
  }

  const data = parsed.data;
  let templateIds = audit.templateIds;

  if (data.types) {
    templateIds = await resolveTemplateIdsForTypes(data.types);
  }

  await sql.begin(async (tx) => {
    await tx`
      UPDATE audit
      SET
        client_id = COALESCE(${data.clientId ?? null}::uuid, client_id),
        types = COALESCE(${data.types ?? null}, types),
        template_ids = ${templateIds}::uuid[],
        segment = COALESCE(${data.segment ?? null}, segment),
        assigned_tech_id = COALESCE(${data.assignedTechId ?? null}::uuid, assigned_tech_id),
        scheduled_at = COALESCE(${data.scheduledAt ? new Date(data.scheduledAt) : null}, scheduled_at)
      WHERE id = ${auditId}
    `;

    if (data.cabResponses) {
      const cabItems = await getCabItemsForTypes(audit.types);
      const clientFields = await getClientCabFields(audit.clientId);
      const cabDefaults = clientFields
        ? clientToCabValues(clientFields, cabItems, data.scheduledAt ?? audit.scheduledAt)
        : {};
      const mergedCabResponses = mergeCabResponses(cabDefaults, data.cabResponses);

      await upsertCabResponses(tx, auditId, templateIds, mergedCabResponses, userId);
      const clientId = data.clientId ?? audit.clientId;
      await syncClientFromCab(tx, clientId, cabItems, mergedCabResponses);
    }
  });
}

export async function archiveAudit(auditId: string, adminId: string): Promise<void> {
  const sql = getSql();

  const [row] = await sql<{ status: AuditStatus; archived_at: Date | null }[]>`
    SELECT status, archived_at FROM audit WHERE id = ${auditId}
  `;

  if (!row || row.archived_at) {
    throw new AuditNotFoundError();
  }

  await sql`
    UPDATE audit
    SET archived_at = now()
    WHERE id = ${auditId}
  `;

  void adminId;
}

export function assertCanEditAudit(audit: { status: AuditStatus; archivedAt: Date | null }): void {
  if (audit.archivedAt) {
    throw new AuditNotFoundError();
  }
  if (audit.status === 'cerrada') {
    throw new AuditClosedError();
  }
}

export async function listTechnicians(): Promise<Array<{ id: string; name: string }>> {
  const sql = getSql();
  const rows = await sql<{ id: string; name: string }[]>`
    SELECT id, name
    FROM app_user
    WHERE role IN ('admin', 'tecnico') AND active = true
    ORDER BY name ASC
  `;
  return rows;
}

export type ClientPickerRow = {
  id: string;
  razonSocial: string;
  cuit: string | null;
  cabFields: ClientCabFields;
};

export async function searchClientsForPicker(query: string): Promise<ClientPickerRow[]> {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }

  const sql = getSql();
  const pattern = `%${q}%`;
  const rows = await sql<(ClientCabRow & { id: string })[]>`
    SELECT
      id, razon_social, cuit, rubro, empleados,
      referente_nombre, referente_contacto,
      erp_actual, proveedor_correo, soporte_it_actual
    FROM client
    WHERE razon_social ILIKE ${pattern} OR COALESCE(cuit, '') ILIKE ${pattern}
    ORDER BY razon_social ASC
    LIMIT 50
  `;

  return rows.map((row) => ({
    id: row.id,
    razonSocial: row.razon_social,
    cuit: row.cuit,
    cabFields: mapClientRow(row)
  }));
}

export async function getCabItemsForTypes(
  types: string[]
): Promise<
  Array<{
    id: string;
    label: string;
    fieldType: string;
    filledBy: string;
    required: boolean;
    options: Record<string, unknown>;
  }>
> {
  const templateIds = await resolveTemplateIdsForTypes(types);
  const sql = getSql();

  const rows = await sql<
    {
      id: string;
      label: string;
      field_type: string;
      filled_by: string;
      required: boolean;
      options: Record<string, unknown>;
    }[]
  >`
    SELECT ti.id, ti.label, ti.field_type, ti.filled_by, ti.required, ti.options
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE s.template_id = ANY(${templateIds}::uuid[])
      AND s.code = 'CAB'
    ORDER BY s.sort_order, ti.sort_order
  `;

  const seen = new Set<string>();
  const items: Array<{
    id: string;
    label: string;
    fieldType: string;
    filledBy: string;
    required: boolean;
    options: Record<string, unknown>;
  }> = [];

  for (const r of rows) {
    if (seen.has(r.label)) {
      continue;
    }
    seen.add(r.label);
    items.push({
      id: r.id,
      label: r.label,
      fieldType: r.field_type,
      filledBy: r.filled_by,
      required: r.required,
      options: r.options
    });
  }

  return items;
}
