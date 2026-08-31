/**
 * #62 — Read-model consolidado multi-VLAN por auditoría.
 * Query en módulo propio (no vista ni tabla derivada): dedup por `identidad`,
 * precedencia "más reciente con relleno de huecos" por campo, revisión
 * efectiva por grupo y provenance por escaneo. Toda función recibe
 * `empresaId` y lo aplica en la misma query vía join con `audit` (R27/R28).
 */
import type postgres from 'postgres';
import { getSql } from '$lib/server/db/client';
import { tableOptionsSchema } from '$lib/server/db/field-schemas';
import { EscaneoNotFoundError } from './errors';
import type { EscaneoRow, RevisionMetricas } from './repo';
import type {
  DispositivoRevision,
  DispositivoTipo,
  EscaneoEstado
} from './schemas';

export type OcurrenciaConsolidada = {
  dispositivoId: string;
  escaneoId: string;
  escaneoEtiqueta: string | null;
  escaneoRango: string;
  escaneoEstado: EscaneoEstado;
  vistoAt: Date | null;
};

export type DispositivoConsolidado = {
  identidad: string;
  identidadPorIp: boolean; // true si ninguna ocurrencia tiene MAC (R15)
  mac: string | null;
  ip: string;
  hostname: string | null;
  fqdn: string | null;
  fabricante: string | null;
  modelo: string | null;
  serial: string | null;
  tipo: DispositivoTipo;
  soFamilia: string | null;
  soNombre: string | null;
  soVersion: string | null;
  cpuDescripcion: string | null;
  memoriaMb: number | null;
  discoTotalGb: number | null;
  vistoAt: Date | null; // el más reciente entre ocurrencias
  revision: DispositivoRevision; // efectiva (R13)
  revisadoPor: string | null;
  revisadoAt: Date | null;
  notaTecnico: string | null;
  relevamientoItemId: string | null;
  relevamientoRowId: string | null;
  canonicalId: string; // id de la ocurrencia rn = 1 (software/servicios, R18)
  ocurrencias: OcurrenciaConsolidada[]; // provenance (R10)
};

export type FiltrosConsolidado = {
  tipo?: DispositivoTipo;
  revision?: DispositivoRevision; // sobre la revisión efectiva
  escaneoId?: string; // grupos con al menos una ocurrencia en ese escaneo
  limit?: number; // default 100, máx 500 (misma cota que #59)
  offset?: number;
};

export type VinculoResuelto = {
  itemId: string;
  rowId: string;
  itemLabel: string;
  resumenFila: string; // "Tipo: Servidor · Modelo: HP DL380" (celdas no vacías)
  vivo: boolean; // false si la fila ya no existe en value.rows (R25)
};

export type DispositivoConsolidadoDetalle = DispositivoConsolidado & {
  software: { nombre: string; version: string | null; publisher: string | null }[];
  servicios: {
    puerto: number;
    protocolo: string;
    estadoPuerto: string;
    servicio: string | null;
    producto: string | null;
    version: string | null;
  }[];
  ocurrenciasRaw: {
    dispositivoId: string;
    escaneoId: string;
    escaneoEtiqueta: string | null;
    vistoAt: Date | null;
    raw: Record<string, unknown>;
  }[];
  vinculo: VinculoResuelto | null;
};

export type FilaInventarioManual = {
  itemId: string;
  itemLabel: string;
  sectionTitle: string;
  rowId: string;
  resumen: string;
};

export type EscaneoParaUi = EscaneoRow & {
  tokenActivo: boolean;
  tokenExpiresAt: Date | null;
};

type OcurrenciaJson = {
  dispositivoId: string;
  escaneoId: string;
  escaneoEtiqueta: string | null;
  escaneoRango: string;
  escaneoEstado: EscaneoEstado;
  vistoAt: string | null;
};

type ConsolidadoRow = {
  identidad: string;
  identidad_por_ip: boolean;
  mac: string | null;
  ip: string;
  hostname: string | null;
  fqdn: string | null;
  fabricante: string | null;
  modelo: string | null;
  serial: string | null;
  tipo: DispositivoTipo;
  so_familia: string | null;
  so_nombre: string | null;
  so_version: string | null;
  cpu_descripcion: string | null;
  memoria_mb: number | null;
  disco_total_gb: number | null;
  visto_at: Date | null;
  revision: DispositivoRevision;
  revisado_por: string | null;
  revisado_at: Date | null;
  nota_tecnico: string | null;
  relevamiento_item_id: string | null;
  relevamiento_row_id: string | null;
  canonical_id: string;
  escaneo_ids: string[];
  ocurrencias: OcurrenciaJson[];
};

type FilaRelevamientoJson = {
  row_id?: unknown;
  cells?: Record<string, unknown>;
};

/**
 * CTE compartido (R9–R17): `oc` numera ocurrencias por identidad con la
 * precedencia del design (`visto_at DESC NULLS LAST`, `updated_at DESC`, id);
 * `consolidado` agrega por identidad con relleno de huecos por campo, `tipo`
 * que salta `desconocido` (R12) y revisión efectiva ≠ sin_revisar más
 * reciente (R13/R14). El filtro de empresa vive acá mismo (R27/R28).
 */
function consolidadoCte(sql: postgres.Sql, empresaId: string, auditId: string) {
  return sql`
    WITH oc AS (
      SELECT
        d.id,
        d.escaneo_id,
        d.identidad,
        d.mac,
        d.ip,
        d.hostname,
        d.fqdn,
        d.fabricante,
        d.modelo,
        d.serial,
        d.tipo,
        d.so_familia,
        d.so_nombre,
        d.so_version,
        d.cpu_descripcion,
        d.memoria_mb,
        d.disco_total_gb,
        d.visto_at,
        d.updated_at,
        d.revision,
        d.revisado_por,
        d.revisado_at,
        d.nota_tecnico,
        d.relevamiento_item_id,
        d.relevamiento_row_id,
        e.etiqueta AS escaneo_etiqueta,
        e.rango_objetivo AS escaneo_rango,
        e.estado AS escaneo_estado,
        ROW_NUMBER() OVER (
          PARTITION BY d.identidad
          ORDER BY d.visto_at DESC NULLS LAST, d.updated_at DESC, d.id
        ) AS rn
      FROM escaneo_dispositivo d
      JOIN escaneo e ON e.id = d.escaneo_id
      JOIN audit a ON a.id = e.audit_id
      WHERE e.audit_id = ${auditId}
        AND a.empresa_id = ${empresaId}
    ),
    consolidado AS (
      SELECT
        identidad,
        bool_and(mac IS NULL) AS identidad_por_ip,
        (ARRAY_AGG(mac ORDER BY rn) FILTER (WHERE mac IS NOT NULL))[1] AS mac,
        (ARRAY_AGG(ip ORDER BY rn))[1] AS ip,
        (ARRAY_AGG(hostname ORDER BY rn) FILTER (WHERE hostname IS NOT NULL))[1] AS hostname,
        (ARRAY_AGG(fqdn ORDER BY rn) FILTER (WHERE fqdn IS NOT NULL))[1] AS fqdn,
        (ARRAY_AGG(fabricante ORDER BY rn) FILTER (WHERE fabricante IS NOT NULL))[1] AS fabricante,
        (ARRAY_AGG(modelo ORDER BY rn) FILTER (WHERE modelo IS NOT NULL))[1] AS modelo,
        (ARRAY_AGG(serial ORDER BY rn) FILTER (WHERE serial IS NOT NULL))[1] AS serial,
        COALESCE(
          (ARRAY_AGG(tipo ORDER BY rn) FILTER (WHERE tipo <> 'desconocido'))[1],
          'desconocido'
        ) AS tipo,
        (ARRAY_AGG(so_familia ORDER BY rn) FILTER (WHERE so_familia IS NOT NULL))[1] AS so_familia,
        (ARRAY_AGG(so_nombre ORDER BY rn) FILTER (WHERE so_nombre IS NOT NULL))[1] AS so_nombre,
        (ARRAY_AGG(so_version ORDER BY rn) FILTER (WHERE so_version IS NOT NULL))[1] AS so_version,
        (ARRAY_AGG(cpu_descripcion ORDER BY rn) FILTER (WHERE cpu_descripcion IS NOT NULL))[1]
          AS cpu_descripcion,
        (ARRAY_AGG(memoria_mb ORDER BY rn) FILTER (WHERE memoria_mb IS NOT NULL))[1] AS memoria_mb,
        (ARRAY_AGG(disco_total_gb ORDER BY rn) FILTER (WHERE disco_total_gb IS NOT NULL))[1]
          AS disco_total_gb,
        (ARRAY_AGG(visto_at ORDER BY rn))[1] AS visto_at,
        COALESCE(
          (ARRAY_AGG(revision ORDER BY revisado_at DESC NULLS LAST, rn)
            FILTER (WHERE revision <> 'sin_revisar'))[1],
          'sin_revisar'
        ) AS revision,
        (ARRAY_AGG(revisado_por ORDER BY revisado_at DESC NULLS LAST, rn)
          FILTER (WHERE revision <> 'sin_revisar'))[1] AS revisado_por,
        (ARRAY_AGG(revisado_at ORDER BY revisado_at DESC NULLS LAST, rn)
          FILTER (WHERE revision <> 'sin_revisar'))[1] AS revisado_at,
        (ARRAY_AGG(nota_tecnico ORDER BY revisado_at DESC NULLS LAST, rn)
          FILTER (WHERE nota_tecnico IS NOT NULL))[1] AS nota_tecnico,
        (ARRAY_AGG(relevamiento_item_id ORDER BY rn)
          FILTER (WHERE relevamiento_item_id IS NOT NULL))[1] AS relevamiento_item_id,
        (ARRAY_AGG(relevamiento_row_id ORDER BY rn)
          FILTER (WHERE relevamiento_item_id IS NOT NULL))[1] AS relevamiento_row_id,
        (ARRAY_AGG(id ORDER BY rn))[1] AS canonical_id,
        ARRAY_AGG(escaneo_id) AS escaneo_ids,
        jsonb_agg(
          jsonb_build_object(
            'dispositivoId', id,
            'escaneoId', escaneo_id,
            'escaneoEtiqueta', escaneo_etiqueta,
            'escaneoRango', escaneo_rango,
            'escaneoEstado', escaneo_estado,
            'vistoAt', visto_at
          ) ORDER BY rn
        ) AS ocurrencias
      FROM oc
      GROUP BY identidad
    )
  `;
}

function mapConsolidado(row: ConsolidadoRow): DispositivoConsolidado {
  return {
    identidad: row.identidad,
    identidadPorIp: row.identidad_por_ip,
    mac: row.mac,
    ip: row.ip,
    hostname: row.hostname,
    fqdn: row.fqdn,
    fabricante: row.fabricante,
    modelo: row.modelo,
    serial: row.serial,
    tipo: row.tipo,
    soFamilia: row.so_familia,
    soNombre: row.so_nombre,
    soVersion: row.so_version,
    cpuDescripcion: row.cpu_descripcion,
    memoriaMb: row.memoria_mb,
    discoTotalGb: row.disco_total_gb,
    vistoAt: row.visto_at,
    revision: row.revision,
    revisadoPor: row.revisado_por,
    revisadoAt: row.revisado_at,
    notaTecnico: row.nota_tecnico,
    relevamientoItemId: row.relevamiento_item_id,
    relevamientoRowId: row.relevamiento_row_id,
    canonicalId: row.canonical_id,
    ocurrencias: row.ocurrencias.map((o) => ({
      dispositivoId: o.dispositivoId,
      escaneoId: o.escaneoId,
      escaneoEtiqueta: o.escaneoEtiqueta,
      escaneoRango: o.escaneoRango,
      escaneoEstado: o.escaneoEstado,
      vistoAt: o.vistoAt ? new Date(o.vistoAt) : null
    }))
  };
}

function filtrosWhere(sql: postgres.Sql, filtros: FiltrosConsolidado) {
  return sql`
    WHERE TRUE
    ${filtros.tipo ? sql`AND tipo = ${filtros.tipo}` : sql``}
    ${filtros.revision ? sql`AND revision = ${filtros.revision}` : sql``}
    ${filtros.escaneoId ? sql`AND ${filtros.escaneoId}::uuid = ANY(escaneo_ids)` : sql``}
  `;
}

/** R9–R16, R27/R28: lista consolidada con filtros y paginación server-side. */
export async function listarConsolidado(
  empresaId: string,
  auditId: string,
  filtros: FiltrosConsolidado = {}
): Promise<{ items: DispositivoConsolidado[]; total: number }> {
  const sql = getSql();
  const limit = Math.min(Math.max(filtros.limit ?? 100, 1), 500);
  const offset = Math.max(filtros.offset ?? 0, 0);
  const cte = consolidadoCte(sql, empresaId, auditId);
  const where = filtrosWhere(sql, filtros);

  const rows = await sql<ConsolidadoRow[]>`
    ${cte}
    SELECT * FROM consolidado
    ${where}
    ORDER BY (revision = 'sin_revisar') DESC, ip ASC, identidad ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [{ total }] = await sql<{ total: number }[]>`
    ${cte}
    SELECT count(*)::int AS total FROM consolidado
    ${where}
  `;

  return { items: rows.map(mapConsolidado), total };
}

/** R17: contadores por revisión efectiva sobre el consolidado completo. */
export async function contadoresRevisionConsolidado(
  empresaId: string,
  auditId: string
): Promise<RevisionMetricas> {
  const sql = getSql();
  const cte = consolidadoCte(sql, empresaId, auditId);
  const rows = await sql<{ revision: DispositivoRevision; total: number }[]>`
    ${cte}
    SELECT revision, count(*)::int AS total FROM consolidado GROUP BY revision
  `;
  const metricas: RevisionMetricas = {
    sin_revisar: 0,
    confirmado: 0,
    descartado: 0,
    fusionado: 0
  };
  for (const r of rows) {
    metricas[r.revision] = r.total;
  }
  return metricas;
}

/** Primeras 3 celdas no vacías como "<label columna>: <valor>". */
function resumenDeFila(options: unknown, cells: Record<string, unknown>): string {
  const parsed = tableOptionsSchema.safeParse(options ?? {});
  if (!parsed.success) return '';
  const partes: string[] = [];
  for (const col of parsed.data.columns) {
    const valor = cells[col.key];
    if (valor === null || valor === undefined || String(valor).trim() === '') continue;
    partes.push(`${col.label}: ${String(valor)}`);
    if (partes.length === 3) break;
  }
  return partes.join(' · ');
}

async function resolverVinculo(
  sql: postgres.Sql,
  empresaId: string,
  auditId: string,
  itemId: string,
  rowId: string
): Promise<VinculoResuelto | null> {
  const [row] = await sql<{ label: string; options: unknown; value: unknown }[]>`
    SELECT ti.label, ti.options, ar.value
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    JOIN audit a ON s.template_id = ANY(a.template_ids) AND a.id = ${auditId}
    LEFT JOIN audit_response ar ON ar.audit_id = a.id AND ar.item_id = ti.id
    WHERE ti.id = ${itemId}
      AND a.empresa_id = ${empresaId}
  `;
  if (!row) return null;

  const value = row.value as { rows?: FilaRelevamientoJson[] } | null;
  const filas = Array.isArray(value?.rows) ? value.rows : [];
  const fila = filas.find((r) => r?.row_id === rowId);
  return {
    itemId,
    rowId,
    itemLabel: row.label,
    resumenFila: fila?.cells ? resumenDeFila(row.options, fila.cells) : '',
    vivo: fila !== undefined
  };
}

/**
 * R18/R19/R25: detalle por identidad. Software y servicios solo de la
 * ocurrencia canónica (unir entre escaneos es diff, #64); raw por ocurrencia
 * sin transformación; vínculo resuelto contra la response de ESTA auditoría.
 */
export async function obtenerDispositivoConsolidado(
  empresaId: string,
  auditId: string,
  identidad: string
): Promise<DispositivoConsolidadoDetalle> {
  const sql = getSql();
  const cte = consolidadoCte(sql, empresaId, auditId);
  const [row] = await sql<ConsolidadoRow[]>`
    ${cte}
    SELECT * FROM consolidado WHERE identidad = ${identidad}
  `;
  if (!row) throw new EscaneoNotFoundError('Dispositivo no encontrado');
  const base = mapConsolidado(row);

  const software = await sql<
    { nombre: string; version: string | null; publisher: string | null }[]
  >`
    SELECT nombre, version, publisher
    FROM escaneo_software
    WHERE dispositivo_id = ${base.canonicalId}
    ORDER BY nombre ASC
  `;

  const serviciosRows = await sql<
    {
      puerto: number;
      protocolo: string;
      estado_puerto: string;
      servicio: string | null;
      producto: string | null;
      version: string | null;
    }[]
  >`
    SELECT puerto, protocolo, estado_puerto, servicio, producto, version
    FROM escaneo_servicio
    WHERE dispositivo_id = ${base.canonicalId}
    ORDER BY puerto ASC, protocolo ASC
  `;

  const ocurrenciasRaw = await sql<
    {
      dispositivo_id: string;
      escaneo_id: string;
      escaneo_etiqueta: string | null;
      visto_at: Date | null;
      raw: Record<string, unknown>;
    }[]
  >`
    SELECT d.id AS dispositivo_id, d.escaneo_id, e.etiqueta AS escaneo_etiqueta,
           d.visto_at, d.raw
    FROM escaneo_dispositivo d
    JOIN escaneo e ON e.id = d.escaneo_id
    JOIN audit a ON a.id = e.audit_id
    WHERE e.audit_id = ${auditId}
      AND a.empresa_id = ${empresaId}
      AND d.identidad = ${identidad}
    ORDER BY d.visto_at DESC NULLS LAST, d.updated_at DESC, d.id
  `;

  const vinculo =
    base.relevamientoItemId && base.relevamientoRowId
      ? await resolverVinculo(sql, empresaId, auditId, base.relevamientoItemId, base.relevamientoRowId)
      : null;

  return {
    ...base,
    software,
    servicios: serviciosRows.map((s) => ({
      puerto: s.puerto,
      protocolo: s.protocolo,
      estadoPuerto: s.estado_puerto,
      servicio: s.servicio,
      producto: s.producto,
      version: s.version
    })),
    ocurrenciasRaw: ocurrenciasRaw.map((o) => ({
      dispositivoId: o.dispositivo_id,
      escaneoId: o.escaneo_id,
      escaneoEtiqueta: o.escaneo_etiqueta,
      vistoAt: o.visto_at,
      raw: o.raw
    })),
    vinculo
  };
}

/**
 * Filas del relevamiento manual de la auditoría (selector de fusión): todos
 * los ítems-tabla de la plantilla, agrupados por sección, con resumen legible.
 */
export async function listarFilasInventarioManual(
  empresaId: string,
  auditId: string
): Promise<FilaInventarioManual[]> {
  const sql = getSql();
  const rows = await sql<
    {
      item_id: string;
      item_label: string;
      section_title: string;
      options: unknown;
      row: FilaRelevamientoJson;
    }[]
  >`
    SELECT
      ti.id AS item_id,
      ti.label AS item_label,
      ti.options,
      s.title AS section_title,
      fila.row
    FROM audit a
    JOIN section s ON s.template_id = ANY(a.template_ids)
    JOIN template_item ti ON ti.section_id = s.id AND ti.field_type = 'table'
    JOIN audit_response ar ON ar.audit_id = a.id AND ar.item_id = ti.id
    CROSS JOIN LATERAL jsonb_array_elements(ar.value->'rows')
      WITH ORDINALITY AS fila(row, ord)
    WHERE a.id = ${auditId}
      AND a.empresa_id = ${empresaId}
    ORDER BY s.sort_order, ti.sort_order, fila.ord
  `;

  const filas: FilaInventarioManual[] = [];
  for (const r of rows) {
    // Filas históricas sin row_id no son vinculables: no se ofrecen
    if (typeof r.row?.row_id !== 'string' || r.row.row_id.length === 0) continue;
    filas.push({
      itemId: r.item_id,
      itemLabel: r.item_label,
      sectionTitle: r.section_title,
      rowId: r.row.row_id,
      resumen: resumenDeFila(r.options, r.row.cells ?? {})
    });
  }
  return filas;
}

/** R8: escaneos de la auditoría con estado de token activo (join #60). */
export async function listarEscaneosParaUi(
  empresaId: string,
  auditId: string
): Promise<EscaneoParaUi[]> {
  const sql = getSql();
  const rows = await sql<
    (EscaneoRow & { token_activo: boolean; token_expires_at: Date | null })[]
  >`
    SELECT e.*,
      (t.id IS NOT NULL) AS token_activo,
      t.expires_at AS token_expires_at
    FROM escaneo e
    JOIN audit a ON a.id = e.audit_id
    LEFT JOIN escaneo_token t
      ON t.escaneo_id = e.id AND t.revoked_at IS NULL AND t.expires_at > now()
    WHERE e.audit_id = ${auditId}
      AND a.empresa_id = ${empresaId}
    ORDER BY e.created_at DESC
  `;
  return rows.map((r) => {
    const { token_activo, token_expires_at, ...escaneo } = r;
    return { ...escaneo, tokenActivo: token_activo, tokenExpiresAt: token_expires_at };
  });
}
