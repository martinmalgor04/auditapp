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
import type { AppUser } from '$lib/server/auth/types';
import { auditMatchesUserScope, userCanUseAuditTypes } from '$lib/server/auth/audit-access';
import { insertAuditAssignments } from '$lib/server/db/audit-assignment';
import { AUDIT_TYPES, type AuditType } from '$lib/audit-types';
import { buildEmpresaCode, formatRefCode } from '$lib/server/clients/normalize';
import {
  AuditClosedError,
  AuditNotFoundError,
  DuplicateAuditWarning,
  ForbiddenError,
  ValidationError,
  type ActiveAuditConflict
} from './errors';
import { createAuditSchema, updateAuditSchema, type CreateAuditInput, type UpdateAuditInput } from './schemas';
import { computeAuditProgress, type AuditProgress } from './progress';
import { onAuditoriaAsignada } from '$lib/server/email/notify';

const TYPE_TO_TEMPLATE_CODE: Record<string, string> = {
  it: 'it',
  'erp-tango': 'erp-tango',
  'erp-estandar': 'erp-estandar'
};

// #32 (R10): orden canónico de tipos para elegir el técnico líder de forma
// determinística (it < erp-tango < erp-estandar). El líder es el técnico del
// primer tipo presente en este orden y puebla audit.assigned_tech_id.
const CANONICAL_TYPE_ORDER: AuditType[] = [...AUDIT_TYPES];

function leadAuditType(types: AuditType[]): AuditType {
  const ordered = [...types].sort(
    (a, b) => CANONICAL_TYPE_ORDER.indexOf(a) - CANONICAL_TYPE_ORDER.indexOf(b)
  );
  return ordered[0];
}

export type AuditDetail = {
  id: string;
  name: string;
  refCode: string;
  clientId: string;
  razonSocial: string;
  types: string[];
  segment: string;
  status: AuditStatus;
  assignedTechId: string | null;
  techName: string | null;
  scheduledAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
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
  ref_code: string;
  client_id: string;
  razon_social: string;
  types: string[];
  segment: string;
  status: AuditStatus;
  assigned_tech_id: string | null;
  tech_name: string | null;
  scheduled_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
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

/** Resuelve codigo único para empresa (#41, R1–R2). */
export async function ensureEmpresaCodigo(
  tx: DbExecutor,
  empresaId: string | null,
  razonSocial: string
): Promise<string> {
  const base = buildEmpresaCode(razonSocial);
  for (let n = 0; ; n++) {
    const candidate = n === 0 ? base : `${base}${n + 1}`;
    const [exists] = await tx<{ id: string }[]>`
      SELECT id FROM empresa
      WHERE codigo = ${candidate}
        AND (${empresaId}::uuid IS NULL OR id <> ${empresaId})
      LIMIT 1
    `;
    if (!exists) return candidate;
  }
}

/** Asigna correlativo atómico y compone ref_code (#41, R8). */
export async function allocateRefCode(
  tx: DbExecutor,
  empresaId: string,
  auditType: AuditType,
  empresaCodigo: string
): Promise<string> {
  const [row] = await tx<{ last_seq: number }[]>`
    INSERT INTO audit_ref_counter (empresa_id, audit_type, last_seq)
    VALUES (${empresaId}, ${auditType}, 1)
    ON CONFLICT (empresa_id, audit_type)
    DO UPDATE SET last_seq = audit_ref_counter.last_seq + 1
    RETURNING last_seq
  `;
  return formatRefCode(empresaCodigo, auditType, row.last_seq);
}

/** Auditorías activas del mismo tipo para guard anti-duplicado (#41, R21). */
export async function findActiveSameTypeAudits(
  empresaId: string,
  auditType: AuditType
): Promise<ActiveAuditConflict[]> {
  const sql = getSql();
  const rows = await sql<
    { id: string; ref_code: string; status: AuditStatus; encargada: string | null }[]
  >`
    SELECT a.id, a.ref_code, a.status, u.name AS encargada
    FROM audit a
    LEFT JOIN app_user u ON u.id = a.assigned_tech_id
    WHERE a.empresa_id = ${empresaId}
      AND a.archived_at IS NULL
      AND a.status <> 'cerrada'
      AND ${auditType} = ANY(a.types)
    ORDER BY a.created_at ASC
  `;
  return rows.map((r) => ({
    id: r.id,
    refCode: r.ref_code,
    status: r.status,
    encargada: r.encargada
  }));
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
  direccion: string | null;
  telefono: string | null;
  email: string | null;
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
    soporteItActual: row.soporte_it_actual,
    direccion: row.direccion,
    telefono: row.telefono,
    email: row.email
  };
}

export async function getClientCabFields(clientId: string): Promise<ClientCabFields | null> {
  const sql = getSql();
  const [row] = await sql<ClientCabRow[]>`
    SELECT
      razon_social, cuit, rubro, empleados,
      referente_nombre, referente_contacto,
      erp_actual, proveedor_correo, soporte_it_actual,
      direccion, telefono, email
    FROM empresa
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
    UPDATE empresa
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
      direccion = COALESCE(${patch.direccion ?? null}, direccion),
      telefono = COALESCE(${patch.telefono ?? null}, telefono),
      email = COALESCE(${patch.email ?? null}, email),
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
  createdBy: string,
  actor?: AppUser
): Promise<{ id: string }> {
  const parsed = createAuditSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.errors[0]?.message ?? 'Datos inválidos');
  }

  const data = parsed.data;
  if (actor && !userCanUseAuditTypes(data.types as AuditType[], actor)) {
    throw new ForbiddenError('No tenés permiso para crear auditorías con esos tipos');
  }

  const auditType = data.types[0] as AuditType;
  const sql = getSql();

  let clientIdForGuard = data.clientId;
  if (!clientIdForGuard && data.newClient) {
    // Empresa nueva: no hay conflictos previos.
    clientIdForGuard = undefined;
  }
  if (clientIdForGuard && !data.confirmDuplicate) {
    const conflicts = await findActiveSameTypeAudits(clientIdForGuard, auditType);
    if (conflicts.length > 0) {
      throw new DuplicateAuditWarning(conflicts);
    }
  }

  // #32 (R7): validar especialidad de cada técnico para el tipo que se le asigna.
  // Un técnico solo puede ser asignado a un tipo que esté en su scope de especialidad.
  const techByType = data.techByType as Record<AuditType, string>;
  const assignmentEntries = data.types.map((type) => ({
    auditType: type as AuditType,
    techId: techByType[type as AuditType]
  }));
  const techIds = [...new Set(assignmentEntries.map((a) => a.techId))];
  const techRows = await sql<{ id: string; role: 'admin' | 'tecnico'; audit_types: AuditType[] | null }[]>`
    SELECT id, role, audit_types
    FROM app_user
    WHERE id = ANY(${techIds}) AND active = true
  `;
  const techById = new Map(techRows.map((r) => [r.id, r]));
  for (const { auditType, techId } of assignmentEntries) {
    const tech = techById.get(techId);
    if (!tech) {
      throw new ValidationError('Técnico inválido o inactivo');
    }
    const techUser: AppUser = {
      id: tech.id,
      email: '',
      name: '',
      role: tech.role,
      active: true,
      auditTypes: tech.audit_types
    };
    if (!userCanUseAuditTypes([auditType], techUser)) {
      throw new ValidationError(`El técnico no tiene especialidad para ${auditType}`);
    }
  }

  // #32 (R10): técnico líder = el del tipo en orden canónico → assigned_tech_id (nunca nulo).
  const leadTechId = techByType[leadAuditType(data.types as AuditType[])];

  const templateIds = await resolveTemplateIdsForTypes(data.types);
  const scheduledAt = new Date(data.scheduledAt);
  const cabItems = await getCabItemsForTypes(data.types);

  const result = await sql.begin(async (tx) => {
    let clientId = data.clientId;
    let clientFields: ClientCabFields | null = null;

    if (data.newClient) {
      const codigo = await ensureEmpresaCodigo(tx, null, data.newClient.razonSocial);
      const [client] = await tx<{ id: string }[]>`
        INSERT INTO empresa (razon_social, cuit, rubro, relacion, codigo)
        VALUES (
          ${data.newClient.razonSocial},
          ${data.newClient.cuit || null},
          ${data.newClient.rubro || null},
          'prospecto',
          ${codigo}
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
          erp_actual, proveedor_correo, soporte_it_actual,
          direccion, telefono, email
        FROM empresa
        WHERE id = ${clientId}
      `;
      clientFields = clientRow ? mapClientRow(clientRow) : null;
    }

    const cabDefaults = clientFields
      ? clientToCabValues(clientFields, cabItems, scheduledAt)
      : {};
    const mergedCabResponses = mergeCabResponses(cabDefaults, data.cabResponses);

    const [clientRow] = await tx<{ razon_social: string; codigo: string | null }[]>`
      SELECT razon_social, codigo FROM empresa WHERE id = ${clientId}
    `;

    let empresaCodigo = clientRow?.codigo ?? null;
    if (!empresaCodigo) {
      empresaCodigo = await ensureEmpresaCodigo(tx, clientId, clientRow!.razon_social);
      await tx`UPDATE empresa SET codigo = ${empresaCodigo} WHERE id = ${clientId} AND codigo IS NULL`;
    }

    const refCode = await allocateRefCode(tx, clientId, auditType, empresaCodigo);
    const name = `Auditoría ${clientRow!.razon_social}`;

    const [audit] = await tx<{ id: string }[]>`
      INSERT INTO audit (
        empresa_id, name, types, template_ids, segment, status,
        assigned_tech_id, created_by, scheduled_at, ref_code
      )
      VALUES (
        ${clientId},
        ${name},
        ${data.types},
        ${templateIds}::uuid[],
        ${data.segment},
        'borrador',
        ${leadTechId},
        ${createdBy},
        ${scheduledAt},
        ${refCode}
      )
      RETURNING id
    `;

    // #32 (R8, R9): una fila audit_assignment por tipo, en la misma tx del alta.
    await insertAuditAssignments(tx, audit.id, assignmentEntries);

    await upsertCabResponses(tx, audit.id, templateIds, mergedCabResponses, createdBy);
    await syncClientFromCab(tx, clientId, cabItems, mergedCabResponses);

    return { id: audit.id };
  });

  void onAuditoriaAsignada(result.id, techIds);
  return result;
}

export async function getAuditById(auditId: string, viewer?: AppUser): Promise<AuditDetail | null> {
  const sql = getSql();

  const [row] = await sql<AuditRow[]>`
    SELECT
      a.id, a.name, a.ref_code, a.empresa_id AS client_id, c.razon_social, a.types, a.segment, a.status,
      a.assigned_tech_id, u.name AS tech_name, a.scheduled_at, a.started_at, a.finished_at,
      a.public_token, a.template_ids, a.archived_at
    FROM audit a
    JOIN empresa c ON c.id = a.empresa_id
    LEFT JOIN app_user u ON u.id = a.assigned_tech_id
    WHERE a.id = ${auditId}
    LIMIT 1
  `;

  if (!row || row.archived_at) {
    return null;
  }

  if (viewer && !auditMatchesUserScope(row.types, viewer)) {
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
      erp_actual, proveedor_correo, soporte_it_actual,
      direccion, telefono, email
    FROM empresa
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
    refCode: row.ref_code,
    clientId: row.client_id,
    razonSocial: row.razon_social,
    types: row.types,
    segment: row.segment,
    status: row.status,
    assignedTechId: row.assigned_tech_id,
    techName: row.tech_name,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
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

  // Lecturas fuera de la transacción: el pool tiene max=1 y un getSql()
  // dentro de sql.begin() espera la conexión que la propia tx retiene (deadlock).
  let cabItems: Awaited<ReturnType<typeof getCabItemsForTypes>> = [];
  let clientFields: ClientCabFields | null = null;
  if (data.cabResponses) {
    cabItems = await getCabItemsForTypes(audit.types);
    clientFields = await getClientCabFields(audit.clientId);
  }

  await sql.begin(async (tx) => {
    const newStartedAt =
      data.startedAt !== undefined
        ? data.startedAt !== null
          ? new Date(data.startedAt)
          : null
        : undefined;
    const newFinishedAt =
      data.finishedAt !== undefined
        ? data.finishedAt !== null
          ? new Date(data.finishedAt)
          : null
        : undefined;

    await tx`
      UPDATE audit
      SET
        empresa_id = COALESCE(${data.clientId ?? null}::uuid, empresa_id),
        types = COALESCE(${data.types ?? null}, types),
        template_ids = ${templateIds}::uuid[],
        segment = COALESCE(${data.segment ?? null}, segment),
        assigned_tech_id = COALESCE(${data.assignedTechId ?? null}::uuid, assigned_tech_id),
        scheduled_at = COALESCE(${data.scheduledAt ? new Date(data.scheduledAt) : null}, scheduled_at),
        started_at = ${newStartedAt !== undefined ? newStartedAt : sql`started_at`},
        finished_at = ${newFinishedAt !== undefined ? newFinishedAt : sql`finished_at`}
      WHERE id = ${auditId}
    `;

    if (data.cabResponses) {
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

export async function listTechnicians(): Promise<
  Array<{ id: string; name: string; role: 'admin' | 'tecnico'; auditTypes: AuditType[] | null }>
> {
  const sql = getSql();
  const rows = await sql<
    { id: string; name: string; role: 'admin' | 'tecnico'; audit_types: AuditType[] | null }[]
  >`
    SELECT id, name, role, audit_types
    FROM app_user
    WHERE role IN ('admin', 'tecnico') AND active = true
    ORDER BY name ASC
  `;
  return rows.map((r) => ({ id: r.id, name: r.name, role: r.role, auditTypes: r.audit_types }));
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
      erp_actual, proveedor_correo, soporte_it_actual,
      direccion, telefono, email
    FROM empresa
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
