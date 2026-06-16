import { getSql } from './client';
import {
  clientToCabValues,
  newClientToCabFields,
  type ClientCabFields
} from '$lib/backoffice/cab-client-map';
import { EmpresaNotFoundError } from '$lib/server/crm/errors';
import {
  ACTIVITY_WINDOW_MONTHS,
  deriveEmpresaEstado,
  type EstadoInputs
} from '$lib/server/crm/empresa-estado';
import type {
  EmpresaListFilters,
  EmpresaUpdateInput,
  EmpresaEstado,
  EmpresaRelacion,
  EmpresaEventoInput,
  EmpresaEventoTipo
} from '$lib/server/crm/schemas';

/**
 * #23 Fase 4 — Capa de datos del cockpit `/crm` (R16, R17, R18, R19).
 *
 * Estrategia de listado: **paginación server-side** (LIMIT/OFFSET + COUNT). NO se cargan las ~2000
 * fichas completas con su timeline; el listado trae solo los campos de fila + un **estado efectivo
 * derivado de forma agregada en UNA sola query** (sin N+1). La derivación del estado se hace en SQL
 * (CTE `agg`) para poder filtrar por estado server-side y mantener consistencia con
 * `deriveEmpresaEstado` del design §3 (que la Fase 5 formaliza en `empresa-estado.ts`).
 *
 * Ventana activa/inactiva = `ACTIVITY_WINDOW_MONTHS` (18 meses, decisión humana 9). La constante se
 * importa de `empresa-estado.ts` (fuente única) para que el intervalo SQL y la derivación TS usen el
 * mismo valor — ver la política de reconciliación en ese módulo.
 */

export type EmpresaListRow = {
  id: string;
  razonSocial: string;
  cuit: string | null;
  relacion: EmpresaRelacion;
  rubro: string | null;
  provincia: string | null;
  estado: EmpresaEstado;
  estadoSource: 'override' | 'derived';
};

type EmpresaListRowRaw = {
  id: string;
  razon_social: string;
  cuit: string | null;
  relacion: EmpresaRelacion;
  rubro: string | null;
  provincia: string | null;
  estado: EmpresaEstado;
  estado_source: 'override' | 'derived';
};

export type EmpresaListResult = {
  rows: EmpresaListRow[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

export type EmpresaDetail = {
  id: string;
  razonSocial: string;
  cuit: string | null;
  relacion: EmpresaRelacion;
  rubro: string | null;
  empleados: number | null;
  puestos: number | null;
  sedes: number | null;
  referenteNombre: string | null;
  referenteCargo: string | null;
  referenteContacto: string | null;
  erpActual: string | null;
  proveedorCorreo: string | null;
  soporteItActual: string | null;
  direccion: string | null;
  cp: string | null;
  provincia: string | null;
  telefono: string | null;
  email: string | null;
  nivelInteres: string | null;
  tieneSoftware: string | null;
  observaciones: string | null;
  fuente: string | null;
  origen: string | null;
  estadoOverride: EmpresaEstado | null;
  estado: EmpresaEstado;
  estadoSource: 'override' | 'derived';
  createdAt: Date;
  updatedAt: Date;
};

type EmpresaRow = {
  id: string;
  razon_social: string;
  cuit: string | null;
  relacion: EmpresaRelacion;
  rubro: string | null;
  empleados: number | null;
  puestos: number | null;
  sedes: number | null;
  referente_nombre: string | null;
  referente_cargo: string | null;
  referente_contacto: string | null;
  erp_actual: string | null;
  proveedor_correo: string | null;
  soporte_it_actual: string | null;
  direccion: string | null;
  cp: string | null;
  provincia: string | null;
  telefono: string | null;
  email: string | null;
  nivel_interes: string | null;
  tiene_software: string | null;
  observaciones: string | null;
  fuente: string | null;
  origen: string | null;
  estado_override: EmpresaEstado | null;
  estado: EmpresaEstado;
  estado_source: 'override' | 'derived';
  created_at: Date;
  updated_at: Date;
};

/**
 * Fragmento SQL reutilizable: por empresa, agrega flags de actividad y deriva el estado efectivo.
 * `estado_source` indica si el valor proviene del override manual (R15) o de la auto-derivación.
 * Las reglas replican `deriveEmpresaEstado` (design §3) en SQL para filtrado/orden server-side.
 *
 * Devuelve un SELECT que expone `id` + `estado` + `estado_source` por empresa; se compone con un
 * JOIN sobre `empresa` en cada consulta. Se computa en UNA pasada (LEFT JOIN agregados), sin N+1.
 */
function estadoSelectSql(sql: ReturnType<typeof getSql>) {
  return sql`
    SELECT
      e.id AS id,
      CASE
        WHEN e.estado_override IS NOT NULL THEN e.estado_override
        WHEN e.relacion = 'ex_cliente' THEN 'inactiva'
        WHEN a.has_presupuesto THEN 'presupuestada'
        WHEN a.has_closed_audit THEN 'auditada'
        WHEN a.has_open_audit THEN 'auditoria_en_curso'
        WHEN e.relacion = 'cliente' THEN
          CASE
            WHEN a.last_activity_at IS NOT NULL
              AND a.last_activity_at > now() - (${ACTIVITY_WINDOW_MONTHS} || ' months')::interval
            THEN 'activa'
            ELSE 'inactiva'
          END
        WHEN a.has_contact_event THEN 'contactada'
        ELSE 'sin_contactar'
      END AS estado,
      CASE WHEN e.estado_override IS NOT NULL THEN 'override' ELSE 'derived' END AS estado_source
    FROM empresa e
    LEFT JOIN LATERAL (
      SELECT
        bool_or(au.status <> 'cerrada') AS has_open_audit,
        bool_or(au.status = 'cerrada') AS has_closed_audit,
        EXISTS (
          SELECT 1 FROM audit_proposal_link apl
          JOIN audit au2 ON au2.id = apl.audit_id
          WHERE au2.empresa_id = e.id AND apl.status = 'activo'
        ) AS has_presupuesto,
        EXISTS (
          SELECT 1 FROM empresa_evento ev
          WHERE ev.empresa_id = e.id
            AND ev.tipo IN ('llamada', 'reunion', 'nota')
        ) AS has_contact_event,
        max(au.created_at) AS last_activity_at
      FROM audit au
      WHERE au.empresa_id = e.id AND au.archived_at IS NULL
    ) a ON true
  `;
}

export async function listEmpresas(filters: EmpresaListFilters): Promise<EmpresaListResult> {
  const sql = getSql();
  const page = filters.page ?? 1;
  const perPage = filters.perPage ?? 50;
  const offset = (page - 1) * perPage;
  const q = filters.q?.trim();
  const pattern = q ? `%${q}%` : null;

  const total = await countEmpresas(filters);

  const rows = await sql<EmpresaListRowRaw[]>`
    WITH est AS (${estadoSelectSql(sql)})
    SELECT
      e.id, e.razon_social, e.cuit, e.relacion, e.rubro, e.provincia,
      est.estado, est.estado_source
    FROM empresa e
    JOIN est ON est.id = e.id
    WHERE
      (${filters.relacion ?? null}::text IS NULL OR e.relacion = ${filters.relacion ?? null})
      AND (${filters.estado ?? null}::text IS NULL OR est.estado = ${filters.estado ?? null})
      AND (
        ${pattern}::text IS NULL
        OR e.razon_social ILIKE ${pattern}
        OR COALESCE(e.cuit, '') ILIKE ${pattern}
      )
    ORDER BY e.razon_social ASC
    LIMIT ${perPage} OFFSET ${offset}
  `;

  return {
    rows: rows.map((r) => ({
      id: r.id,
      razonSocial: r.razon_social,
      cuit: r.cuit,
      relacion: r.relacion,
      rubro: r.rubro,
      provincia: r.provincia,
      estado: r.estado,
      estadoSource: r.estado_source
    })),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage))
  };
}

export async function countEmpresas(filters: EmpresaListFilters): Promise<number> {
  const sql = getSql();
  const q = filters.q?.trim();
  const pattern = q ? `%${q}%` : null;

  // El filtro por estado requiere derivar el estado; cuando no hay filtro de estado evitamos la CTE
  // pesada para que el COUNT sea barato (índices sobre relacion / lower(razon_social)).
  if (!filters.estado) {
    const [row] = await sql<{ c: string }[]>`
      SELECT count(*)::text AS c
      FROM empresa e
      WHERE
        (${filters.relacion ?? null}::text IS NULL OR e.relacion = ${filters.relacion ?? null})
        AND (
          ${pattern}::text IS NULL
          OR e.razon_social ILIKE ${pattern}
          OR COALESCE(e.cuit, '') ILIKE ${pattern}
        )
    `;
    return Number(row.c);
  }

  const [row] = await sql<{ c: string }[]>`
    WITH est AS (${estadoSelectSql(sql)})
    SELECT count(*)::text AS c
    FROM empresa e
    JOIN est ON est.id = e.id
    WHERE
      (${filters.relacion ?? null}::text IS NULL OR e.relacion = ${filters.relacion ?? null})
      AND est.estado = ${filters.estado}
      AND (
        ${pattern}::text IS NULL
        OR e.razon_social ILIKE ${pattern}
        OR COALESCE(e.cuit, '') ILIKE ${pattern}
      )
  `;
  return Number(row.c);
}

export type EmpresaExportRow = {
  id: string;
  razonSocial: string;
  cuit: string | null;
  relacion: EmpresaRelacion;
  estado: EmpresaEstado;
  estadoSource: 'override' | 'derived';
  rubro: string | null;
  empleados: number | null;
  referenteNombre: string | null;
  referenteContacto: string | null;
  erpActual: string | null;
  direccion: string | null;
  provincia: string | null;
  telefono: string | null;
  email: string | null;
};

type EmpresaExportRowRaw = {
  id: string;
  razon_social: string;
  cuit: string | null;
  relacion: EmpresaRelacion;
  estado: EmpresaEstado;
  estado_source: 'override' | 'derived';
  rubro: string | null;
  empleados: number | null;
  referente_nombre: string | null;
  referente_contacto: string | null;
  erp_actual: string | null;
  direccion: string | null;
  provincia: string | null;
  telefono: string | null;
  email: string | null;
};

/**
 * #23 Fase 5 (R26): filas del listado **filtrado** (relacion, estado efectivo, búsqueda) con sus
 * datos maestros, SIN paginar — para el export CSV. Mismos predicados de filtro que `listEmpresas`,
 * sin LIMIT/OFFSET. Ordenado por razón social para un CSV estable.
 */
export async function listEmpresasForExport(
  filters: EmpresaListFilters
): Promise<EmpresaExportRow[]> {
  const sql = getSql();
  const q = filters.q?.trim();
  const pattern = q ? `%${q}%` : null;

  const rows = await sql<EmpresaExportRowRaw[]>`
    WITH est AS (${estadoSelectSql(sql)})
    SELECT
      e.id, e.razon_social, e.cuit, e.relacion, est.estado, est.estado_source,
      e.rubro, e.empleados, e.referente_nombre, e.referente_contacto,
      e.erp_actual, e.direccion, e.provincia, e.telefono, e.email
    FROM empresa e
    JOIN est ON est.id = e.id
    WHERE
      (${filters.relacion ?? null}::text IS NULL OR e.relacion = ${filters.relacion ?? null})
      AND (${filters.estado ?? null}::text IS NULL OR est.estado = ${filters.estado ?? null})
      AND (
        ${pattern}::text IS NULL
        OR e.razon_social ILIKE ${pattern}
        OR COALESCE(e.cuit, '') ILIKE ${pattern}
      )
    ORDER BY e.razon_social ASC
  `;

  return rows.map((r) => ({
    id: r.id,
    razonSocial: r.razon_social,
    cuit: r.cuit,
    relacion: r.relacion,
    estado: r.estado,
    estadoSource: r.estado_source,
    rubro: r.rubro,
    empleados: r.empleados,
    referenteNombre: r.referente_nombre,
    referenteContacto: r.referente_contacto,
    erpActual: r.erp_actual,
    direccion: r.direccion,
    provincia: r.provincia,
    telefono: r.telefono,
    email: r.email
  }));
}

export async function getEmpresaById(id: string): Promise<EmpresaDetail | null> {
  const sql = getSql();
  const [row] = await sql<EmpresaRow[]>`
    WITH est AS (${estadoSelectSql(sql)})
    SELECT
      e.id, e.razon_social, e.cuit, e.relacion, e.rubro, e.empleados, e.puestos, e.sedes,
      e.referente_nombre, e.referente_cargo, e.referente_contacto,
      e.erp_actual, e.proveedor_correo, e.soporte_it_actual,
      e.direccion, e.cp, e.provincia, e.telefono, e.email,
      e.nivel_interes, e.tiene_software, e.observaciones, e.fuente, e.origen,
      e.estado_override, e.created_at, e.updated_at,
      est.estado, est.estado_source
    FROM empresa e
    JOIN est ON est.id = e.id
    WHERE e.id = ${id}
    LIMIT 1
  `;
  if (!row) {
    return null;
  }
  return mapDetailRow(row);
}

function mapDetailRow(row: EmpresaRow): EmpresaDetail {
  return {
    id: row.id,
    razonSocial: row.razon_social,
    cuit: row.cuit,
    relacion: row.relacion,
    rubro: row.rubro,
    empleados: row.empleados,
    puestos: row.puestos,
    sedes: row.sedes,
    referenteNombre: row.referente_nombre,
    referenteCargo: row.referente_cargo,
    referenteContacto: row.referente_contacto,
    erpActual: row.erp_actual,
    proveedorCorreo: row.proveedor_correo,
    soporteItActual: row.soporte_it_actual,
    direccion: row.direccion,
    cp: row.cp,
    provincia: row.provincia,
    telefono: row.telefono,
    email: row.email,
    nivelInteres: row.nivel_interes,
    tieneSoftware: row.tiene_software,
    observaciones: row.observaciones,
    fuente: row.fuente,
    origen: row.origen,
    estadoOverride: row.estado_override,
    estado: row.estado,
    estadoSource: row.estado_source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * #23 Fase 4 (R19): actualiza datos maestros y `relacion`. `patch` ya viene validado por
 * `empresaUpdateSchema` (estricto, sin campos no editables). Lanza `EmpresaNotFoundError` si la
 * empresa no existe. El `estado_override` NO se toca acá (es Fase 5).
 */
const EMPRESA_UPDATABLE_COLUMNS = [
  'razon_social',
  'relacion',
  'cuit',
  'rubro',
  'empleados',
  'puestos',
  'sedes',
  'referente_nombre',
  'referente_cargo',
  'referente_contacto',
  'erp_actual',
  'proveedor_correo',
  'soporte_it_actual',
  'direccion',
  'cp',
  'provincia',
  'telefono',
  'email',
  'nivel_interes',
  'tiene_software',
  'observaciones',
  'fuente'
] as const;

export async function updateEmpresa(
  id: string,
  patch: EmpresaUpdateInput
): Promise<EmpresaDetail> {
  const sql = getSql();

  // Solo las columnas presentes en el patch (con valor definido) se actualizan. `null` explícito
  // limpia el campo (los nullable lo permiten); las claves ausentes o `undefined` conservan su
  // valor (sin pisarlas). postgres.js: `sql(obj, ...cols)` genera `SET col = $n` solo de esas cols,
  // y rechaza valores `undefined`, por eso se filtran.
  const present = EMPRESA_UPDATABLE_COLUMNS.filter(
    (c) => c in patch && (patch as Record<string, unknown>)[c] !== undefined
  );

  if (present.length === 0) {
    const existing = await getEmpresaById(id);
    if (!existing) {
      throw new EmpresaNotFoundError(id);
    }
    return existing;
  }

  const row = patch as Record<string, unknown>;
  const [updated] = await sql<{ id: string }[]>`
    UPDATE empresa
    SET ${sql(row, ...present)}, updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  if (!updated) {
    throw new EmpresaNotFoundError(id);
  }
  const detail = await getEmpresaById(id);
  if (!detail) {
    throw new EmpresaNotFoundError(id);
  }
  return detail;
}

export type EmpresaPickerRow = {
  id: string;
  razonSocial: string;
  cuit: string | null;
  cabFields: ClientCabFields;
};

type EmpresaCabRow = {
  id: string;
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

function mapCabRow(row: EmpresaCabRow): ClientCabFields {
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

/** #23 Fase 4 (R17): búsqueda parcial case-insensitive por razón social o CUIT, para pickers. */
export async function searchEmpresasForPicker(query: string): Promise<EmpresaPickerRow[]> {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }
  const sql = getSql();
  const pattern = `%${q}%`;
  const rows = await sql<EmpresaCabRow[]>`
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
    cabFields: mapCabRow(row)
  }));
}

/**
 * #23 Fase 4 (R19, anticipa R21): datos maestros de una empresa en forma `ClientCabFields` para
 * precargar el CAB de una auditoría (reutiliza `cab-client-map`). Misma forma que
 * `getClientCabFields` de `backoffice/audits.ts`.
 */
export async function getEmpresaCabFields(id: string): Promise<ClientCabFields | null> {
  const sql = getSql();
  const [row] = await sql<EmpresaCabRow[]>`
    SELECT
      id, razon_social, cuit, rubro, empleados,
      referente_nombre, referente_contacto,
      erp_actual, proveedor_correo, soporte_it_actual,
      direccion, telefono, email
    FROM empresa
    WHERE id = ${id}
    LIMIT 1
  `;
  return row ? mapCabRow(row) : null;
}

/**
 * #23 Fase 5 (R13, R14) — inputs agregados de derivación de estado para UNA empresa, en una sola
 * query (sin N+1). Reutiliza la misma lógica de agregación que `estadoSelectSql` (flags de actividad
 * de las audits no archivadas + presupuesto + evento de contacto + última actividad), pero los
 * devuelve como `EstadoInputs` para que `deriveEmpresaEstado` (TS) los consuma. Se usa en el test de
 * paridad SQL↔TS y como API de servidor del módulo de estado.
 */
export async function getEstadoInputs(id: string): Promise<EstadoInputs | null> {
  const sql = getSql();
  const [row] = await sql<
    {
      relacion: EmpresaRelacion;
      has_open_audit: boolean | null;
      has_closed_audit: boolean | null;
      has_presupuesto: boolean;
      has_contact_event: boolean;
      last_activity_at: Date | null;
    }[]
  >`
    SELECT
      e.relacion,
      a.has_open_audit,
      a.has_closed_audit,
      a.has_presupuesto,
      a.has_contact_event,
      a.last_activity_at
    FROM empresa e
    LEFT JOIN LATERAL (
      SELECT
        bool_or(au.status <> 'cerrada') AS has_open_audit,
        bool_or(au.status = 'cerrada') AS has_closed_audit,
        EXISTS (
          SELECT 1 FROM audit_proposal_link apl
          JOIN audit au2 ON au2.id = apl.audit_id
          WHERE au2.empresa_id = e.id AND apl.status = 'activo'
        ) AS has_presupuesto,
        EXISTS (
          SELECT 1 FROM empresa_evento ev
          WHERE ev.empresa_id = e.id
            AND ev.tipo IN ('llamada', 'reunion', 'nota')
        ) AS has_contact_event,
        max(au.created_at) AS last_activity_at
      FROM audit au
      WHERE au.empresa_id = e.id AND au.archived_at IS NULL
    ) a ON true
    WHERE e.id = ${id}
    LIMIT 1
  `;
  if (!row) {
    return null;
  }
  return {
    relacion: row.relacion,
    hasOpenAudit: row.has_open_audit ?? false,
    hasClosedAudit: row.has_closed_audit ?? false,
    hasPresupuesto: row.has_presupuesto,
    hasContactEvent: row.has_contact_event,
    lastActivityAt: row.last_activity_at
  };
}

/** #23 Fase 5 (R13/R15): estado efectivo de UNA empresa derivado en TS (consistencia con la ficha). */
export async function deriveEstadoForEmpresa(id: string): Promise<EmpresaEstado | null> {
  const inputs = await getEstadoInputs(id);
  return inputs ? deriveEmpresaEstado(inputs) : null;
}

export type EmpresaEvento = {
  id: string;
  empresaId: string;
  tipo: EmpresaEventoTipo | 'cambio_estado' | 'sistema';
  texto: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
};

type EmpresaEventoRow = {
  id: string;
  empresa_id: string;
  tipo: EmpresaEvento['tipo'];
  texto: string | null;
  from_status: string | null;
  to_status: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: Date;
};

function mapEvento(row: EmpresaEventoRow): EmpresaEvento {
  return {
    id: row.id,
    empresaId: row.empresa_id,
    tipo: row.tipo,
    texto: row.texto,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at
  };
}

/**
 * #23 Fase 5 (R20): timeline de una empresa, más reciente primero. Incluye el nombre del autor
 * (`app_user`) por JOIN para mostrarlo en la ficha sin una segunda query.
 */
export async function listEventos(empresaId: string): Promise<EmpresaEvento[]> {
  const sql = getSql();
  const rows = await sql<EmpresaEventoRow[]>`
    SELECT
      ev.id, ev.empresa_id, ev.tipo, ev.texto, ev.from_status, ev.to_status,
      ev.created_by, u.name AS created_by_name, ev.created_at
    FROM empresa_evento ev
    LEFT JOIN app_user u ON u.id = ev.created_by
    WHERE ev.empresa_id = ${empresaId}
    ORDER BY ev.created_at DESC, ev.id DESC
  `;
  return rows.map(mapEvento);
}

/**
 * #23 Fase 5 (R22): registra un evento/nota manual (llamada/reunion/nota) sobre una empresa, con
 * tipo, texto, fecha (now) y autor (`app_user`). Lanza `EmpresaNotFoundError` si la empresa no existe.
 */
export async function addEvento(
  empresaId: string,
  evento: EmpresaEventoInput,
  createdBy: string
): Promise<EmpresaEvento> {
  const sql = getSql();
  const [exists] = await sql<{ id: string }[]>`SELECT id FROM empresa WHERE id = ${empresaId}`;
  if (!exists) {
    throw new EmpresaNotFoundError(empresaId);
  }
  const [row] = await sql<EmpresaEventoRow[]>`
    WITH inserted AS (
      INSERT INTO empresa_evento (empresa_id, tipo, texto, created_by)
      VALUES (${empresaId}, ${evento.tipo}, ${evento.texto}, ${createdBy})
      RETURNING id, empresa_id, tipo, texto, from_status, to_status, created_by, created_at
    )
    SELECT i.*, u.name AS created_by_name
    FROM inserted i
    LEFT JOIN app_user u ON u.id = i.created_by
  `;
  return mapEvento(row);
}

/**
 * #23 Fase 5 (R23): fija o limpia el `estado_override` manual de una empresa y registra un evento
 * `cambio_estado` en el timeline (de `estado` efectivo previo → nuevo override, o → derivado al
 * limpiar). Atómico (transacción). Lanza `EmpresaNotFoundError` si la empresa no existe.
 */
export async function setEstadoOverride(
  empresaId: string,
  estado: EmpresaEstado | null,
  changedBy: string
): Promise<EmpresaDetail> {
  const sql = getSql();

  // Estado efectivo previo (para `from_status` del evento): override actual si lo hay, si no el
  // derivado. Se lee fuera de la transacción (el pool tiene max=1; un getSql() dentro de sql.begin
  // espera la conexión que la propia tx retiene).
  const before = await getEmpresaById(empresaId);
  if (!before) {
    throw new EmpresaNotFoundError(empresaId);
  }
  const fromStatus = before.estado;
  // Al limpiar el override, `to_status` es el estado que volverá a derivarse.
  const toStatus =
    estado ?? (await deriveEstadoForEmpresa(empresaId)) ?? fromStatus;

  await sql.begin(async (tx) => {
    const [updated] = await tx<{ id: string }[]>`
      UPDATE empresa
      SET estado_override = ${estado}, updated_at = now()
      WHERE id = ${empresaId}
      RETURNING id
    `;
    if (!updated) {
      throw new EmpresaNotFoundError(empresaId);
    }
    await tx`
      INSERT INTO empresa_evento (empresa_id, tipo, texto, from_status, to_status, created_by)
      VALUES (
        ${empresaId},
        'cambio_estado',
        ${estado ? 'Override de estado fijado manualmente' : 'Override de estado quitado (vuelve a derivado)'},
        ${fromStatus},
        ${toStatus},
        ${changedBy}
      )
    `;
  });

  const detail = await getEmpresaById(empresaId);
  if (!detail) {
    throw new EmpresaNotFoundError(empresaId);
  }
  return detail;
}

// Re-export de utilidades CAB para conveniencia de futuros consumidores (Fase 5 T23).
export { clientToCabValues, newClientToCabFields };
export { ACTIVITY_WINDOW_MONTHS };
