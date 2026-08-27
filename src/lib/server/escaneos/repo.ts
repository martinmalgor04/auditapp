import { getSql } from '$lib/server/db/client';
import { AuditNotFoundError, ValidationError } from '$lib/server/backoffice/errors';
import {
  ConsentimientoFaltanteError,
  EscaneoNoMutableError,
  EscaneoNotFoundError,
  TransicionInvalidaError
} from './errors';
import {
  identidadDispositivo,
  TRANSICIONES,
  type CrearEscaneoInput,
  type DispositivoInput,
  type DispositivoRevision,
  type DispositivoTipo,
  type EscaneoEstado,
  type RegistrarConsentimientoInput
} from './schemas';

export type EscaneoRow = {
  id: string;
  audit_id: string;
  tecnico_id: string;
  etiqueta: string | null;
  rango_objetivo: string;
  estado: EscaneoEstado;
  agente_version: string;
  agente_hostname: string | null;
  consentimiento_otorgado: boolean;
  consentimiento_por: string | null;
  consentimiento_at: Date | null;
  dispositivos_detectados: number;
  error_detalle: string | null;
  iniciado_at: Date | null;
  finalizado_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type EscaneoDispositivoRow = {
  id: string;
  escaneo_id: string;
  identidad: string;
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
  so_arquitectura: string | null;
  cpu_descripcion: string | null;
  memoria_mb: number | null;
  disco_total_gb: number | null;
  visto_at: Date | null;
  fuente: string;
  raw: Record<string, unknown>;
  revision: DispositivoRevision;
  revisado_por: string | null;
  revisado_at: Date | null;
  nota_tecnico: string | null;
  created_at: Date;
  updated_at: Date;
};

export type RevisionMetricas = Record<DispositivoRevision, number>;

export type EscaneoDetalle = EscaneoRow & {
  metricas: {
    software: number;
    servicios: number;
    revision: RevisionMetricas;
  };
};

export type FiltrosDispositivos = {
  tipo?: DispositivoTipo;
  revision?: DispositivoRevision;
  limit?: number;
  offset?: number;
};

async function escaneoEnEmpresa(empresaId: string, escaneoId: string): Promise<EscaneoRow> {
  const sql = getSql();
  const [row] = await sql<EscaneoRow[]>`
    SELECT e.*
    FROM escaneo e
    JOIN audit a ON a.id = e.audit_id
    WHERE e.id = ${escaneoId}
      AND a.empresa_id = ${empresaId}
  `;
  if (!row) throw new EscaneoNotFoundError();
  return row;
}

export async function crearEscaneo(
  empresaId: string,
  tecnicoId: string,
  input: CrearEscaneoInput
): Promise<EscaneoRow> {
  const sql = getSql();
  const tieneConsentimiento = input.consentimientoPor != null;
  const [row] = await sql<EscaneoRow[]>`
    INSERT INTO escaneo (
      audit_id, tecnico_id, etiqueta, rango_objetivo,
      agente_version, agente_hostname,
      consentimiento_otorgado, consentimiento_por, consentimiento_at
    )
    SELECT
      a.id, ${tecnicoId}, ${input.etiqueta ?? null}, ${input.rangoObjetivo},
      ${input.agenteVersion}, ${input.agenteHostname ?? null},
      ${tieneConsentimiento}, ${input.consentimientoPor ?? null},
      ${input.consentimientoAt ?? null}
    FROM audit a
    WHERE a.id = ${input.auditId}
      AND a.empresa_id = ${empresaId}
    RETURNING *
  `;
  if (!row) throw new AuditNotFoundError();
  return row;
}

export async function registrarConsentimiento(
  empresaId: string,
  escaneoId: string,
  input: RegistrarConsentimientoInput
): Promise<EscaneoRow> {
  const sql = getSql();
  const [row] = await sql<EscaneoRow[]>`
    UPDATE escaneo e SET
      consentimiento_otorgado = true,
      consentimiento_por = ${input.consentimientoPor},
      consentimiento_at = ${input.consentimientoAt},
      updated_at = now()
    WHERE e.id = ${escaneoId}
      AND e.estado = 'pendiente'
      AND EXISTS (
        SELECT 1
        FROM audit a
        WHERE a.id = e.audit_id
          AND a.empresa_id = ${empresaId}
      )
    RETURNING *
  `;
  if (row) return row;
  // Sin fila: o no existe en la empresa (R27) o ya salió de pendiente.
  await escaneoEnEmpresa(empresaId, escaneoId);
  throw new EscaneoNoMutableError('Solo se puede registrar consentimiento en estado pendiente');
}

export async function upsertDispositivos(
  empresaId: string,
  escaneoId: string,
  dispositivos: DispositivoInput[]
): Promise<void> {
  const sql = getSql();
  await sql.begin(async (tx) => {
    // Pertenencia (R27) + mutabilidad (R4) + serialización de chunks concurrentes
    const [esc] = await tx<{ id: string }[]>`
      SELECT e.id
      FROM escaneo e
      JOIN audit a ON a.id = e.audit_id
      WHERE e.id = ${escaneoId}
        AND a.empresa_id = ${empresaId}
        AND e.estado IN ('en_curso', 'sincronizando')
      FOR UPDATE OF e
    `;
    if (!esc) throw new EscaneoNoMutableError();

    for (const d of dispositivos) {
      const [dev] = await tx<{ id: string }[]>`
        INSERT INTO escaneo_dispositivo ${tx({
          escaneo_id: escaneoId,
          identidad: identidadDispositivo(d),
          mac: d.mac ?? null,
          ip: d.ip,
          hostname: d.hostname ?? null,
          fqdn: d.fqdn ?? null,
          fabricante: d.fabricante ?? null,
          modelo: d.modelo ?? null,
          serial: d.serial ?? null,
          tipo: d.tipo,
          so_familia: d.soFamilia ?? null,
          so_nombre: d.soNombre ?? null,
          so_version: d.soVersion ?? null,
          so_arquitectura: d.soArquitectura ?? null,
          cpu_descripcion: d.cpuDescripcion ?? null,
          memoria_mb: d.memoriaMb ?? null,
          disco_total_gb: d.discoTotalGb ?? null,
          visto_at: d.vistoAt ?? null,
          fuente: d.fuente,
          raw: tx.json(d.raw as never)
        })}
        ON CONFLICT (escaneo_id, identidad) DO UPDATE SET
          ip              = EXCLUDED.ip,
          mac             = COALESCE(EXCLUDED.mac, escaneo_dispositivo.mac),
          hostname        = COALESCE(EXCLUDED.hostname, escaneo_dispositivo.hostname),
          fqdn            = COALESCE(EXCLUDED.fqdn, escaneo_dispositivo.fqdn),
          fabricante      = COALESCE(EXCLUDED.fabricante, escaneo_dispositivo.fabricante),
          modelo          = COALESCE(EXCLUDED.modelo, escaneo_dispositivo.modelo),
          serial          = COALESCE(EXCLUDED.serial, escaneo_dispositivo.serial),
          -- 'desconocido' es el default del schema ("no lo sé"): no pisa un tipo conocido (R18)
          tipo            = CASE WHEN EXCLUDED.tipo = 'desconocido'
                              THEN escaneo_dispositivo.tipo
                              ELSE EXCLUDED.tipo
                            END,
          so_familia      = COALESCE(EXCLUDED.so_familia, escaneo_dispositivo.so_familia),
          so_nombre       = COALESCE(EXCLUDED.so_nombre, escaneo_dispositivo.so_nombre),
          so_version      = COALESCE(EXCLUDED.so_version, escaneo_dispositivo.so_version),
          so_arquitectura = COALESCE(EXCLUDED.so_arquitectura, escaneo_dispositivo.so_arquitectura),
          cpu_descripcion = COALESCE(EXCLUDED.cpu_descripcion, escaneo_dispositivo.cpu_descripcion),
          memoria_mb      = COALESCE(EXCLUDED.memoria_mb, escaneo_dispositivo.memoria_mb),
          disco_total_gb  = COALESCE(EXCLUDED.disco_total_gb, escaneo_dispositivo.disco_total_gb),
          visto_at        = COALESCE(EXCLUDED.visto_at, escaneo_dispositivo.visto_at),
          raw             = EXCLUDED.raw,
          updated_at      = now()
        RETURNING id
      `;

      if (d.software.length) {
        await tx`
          INSERT INTO escaneo_software ${tx(
            d.software.map((s) => ({
              dispositivo_id: dev.id,
              nombre: s.nombre,
              version: s.version ?? null,
              publisher: s.publisher ?? null,
              instalado_at: s.instaladoAt ?? null,
              raw: tx.json(s.raw as never)
            }))
          )}
          ON CONFLICT (dispositivo_id, nombre, version) DO NOTHING
        `;
      }

      if (d.servicios.length) {
        await tx`
          INSERT INTO escaneo_servicio ${tx(
            d.servicios.map((s) => ({
              dispositivo_id: dev.id,
              puerto: s.puerto,
              protocolo: s.protocolo,
              estado_puerto: s.estadoPuerto,
              servicio: s.servicio ?? null,
              producto: s.producto ?? null,
              version: s.version ?? null,
              banner: s.banner ?? null,
              raw: tx.json(s.raw as never)
            }))
          )}
          ON CONFLICT (dispositivo_id, puerto, protocolo) DO UPDATE SET
            estado_puerto = EXCLUDED.estado_puerto,
            servicio      = COALESCE(EXCLUDED.servicio, escaneo_servicio.servicio),
            producto      = COALESCE(EXCLUDED.producto, escaneo_servicio.producto),
            version       = COALESCE(EXCLUDED.version, escaneo_servicio.version),
            banner        = COALESCE(EXCLUDED.banner, escaneo_servicio.banner)
        `;
      }
    }

    await tx`
      UPDATE escaneo SET
        dispositivos_detectados = (
          SELECT count(*) FROM escaneo_dispositivo WHERE escaneo_id = ${escaneoId}
        ),
        updated_at = now()
      WHERE id = ${escaneoId}
    `;
  });
}

export async function cambiarEstadoEscaneo(
  empresaId: string,
  escaneoId: string,
  estado: EscaneoEstado,
  errorDetalle?: string
): Promise<EscaneoRow> {
  const sql = getSql();
  return sql.begin(async (tx) => {
    const [actual] = await tx<EscaneoRow[]>`
      SELECT e.*
      FROM escaneo e
      JOIN audit a ON a.id = e.audit_id
      WHERE e.id = ${escaneoId}
        AND a.empresa_id = ${empresaId}
      FOR UPDATE OF e
    `;
    if (!actual) throw new EscaneoNotFoundError();
    if (!TRANSICIONES[actual.estado].includes(estado)) {
      throw new TransicionInvalidaError(actual.estado, estado);
    }
    if (
      estado === 'en_curso' &&
      !(
        actual.consentimiento_otorgado &&
        actual.consentimiento_por &&
        actual.consentimiento_at
      )
    ) {
      throw new ConsentimientoFaltanteError();
    }
    if (estado === 'fallido' && !errorDetalle) {
      throw new ValidationError('error_detalle es obligatorio al marcar el escaneo como fallido');
    }

    const [row] = await tx<EscaneoRow[]>`
      UPDATE escaneo SET
        estado = ${estado},
        error_detalle = CASE
          WHEN ${estado} = 'fallido' THEN ${errorDetalle ?? null}
          ELSE error_detalle
        END,
        iniciado_at = CASE
          WHEN ${estado} = 'en_curso' THEN now()
          ELSE iniciado_at
        END,
        finalizado_at = CASE
          WHEN ${estado} IN ('completado', 'fallido') THEN now()
          ELSE finalizado_at
        END,
        updated_at = now()
      WHERE id = ${escaneoId}
      RETURNING *
    `;
    return row;
  });
}

export async function listarEscaneosDeAuditoria(
  empresaId: string,
  auditId: string
): Promise<EscaneoRow[]> {
  const sql = getSql();
  return sql<EscaneoRow[]>`
    SELECT e.*
    FROM escaneo e
    JOIN audit a ON a.id = e.audit_id
    WHERE e.audit_id = ${auditId}
      AND a.empresa_id = ${empresaId}
    ORDER BY e.created_at DESC
  `;
}

export async function obtenerEscaneo(
  empresaId: string,
  escaneoId: string
): Promise<EscaneoDetalle> {
  const escaneo = await escaneoEnEmpresa(empresaId, escaneoId);
  const sql = getSql();

  const [conteos] = await sql<{ software: number; servicios: number }[]>`
    SELECT
      (SELECT count(*)::int
         FROM escaneo_software s
         JOIN escaneo_dispositivo d ON d.id = s.dispositivo_id
        WHERE d.escaneo_id = ${escaneoId}) AS software,
      (SELECT count(*)::int
         FROM escaneo_servicio s
         JOIN escaneo_dispositivo d ON d.id = s.dispositivo_id
        WHERE d.escaneo_id = ${escaneoId}) AS servicios
  `;

  const porRevision = await sql<{ revision: DispositivoRevision; total: number }[]>`
    SELECT revision, count(*)::int AS total
    FROM escaneo_dispositivo
    WHERE escaneo_id = ${escaneoId}
    GROUP BY revision
  `;

  const revision: RevisionMetricas = {
    sin_revisar: 0,
    confirmado: 0,
    descartado: 0,
    fusionado: 0
  };
  for (const r of porRevision) {
    revision[r.revision] = r.total;
  }

  return {
    ...escaneo,
    metricas: { software: conteos.software, servicios: conteos.servicios, revision }
  };
}

export async function listarDispositivos(
  empresaId: string,
  escaneoId: string,
  filtros: FiltrosDispositivos = {}
): Promise<{ items: EscaneoDispositivoRow[]; total: number }> {
  await escaneoEnEmpresa(empresaId, escaneoId);
  const sql = getSql();
  const limit = Math.min(Math.max(filtros.limit ?? 100, 1), 500);
  const offset = Math.max(filtros.offset ?? 0, 0);

  const items = await sql<EscaneoDispositivoRow[]>`
    SELECT d.*
    FROM escaneo_dispositivo d
    JOIN escaneo e ON e.id = d.escaneo_id
    JOIN audit a ON a.id = e.audit_id
    WHERE d.escaneo_id = ${escaneoId}
      AND a.empresa_id = ${empresaId}
      ${filtros.tipo ? sql`AND d.tipo = ${filtros.tipo}` : sql``}
      ${filtros.revision ? sql`AND d.revision = ${filtros.revision}` : sql``}
    ORDER BY d.created_at ASC, d.id ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [{ total }] = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM escaneo_dispositivo d
    JOIN escaneo e ON e.id = d.escaneo_id
    JOIN audit a ON a.id = e.audit_id
    WHERE d.escaneo_id = ${escaneoId}
      AND a.empresa_id = ${empresaId}
      ${filtros.tipo ? sql`AND d.tipo = ${filtros.tipo}` : sql``}
      ${filtros.revision ? sql`AND d.revision = ${filtros.revision}` : sql``}
  `;

  return { items, total };
}

export async function marcarRevision(
  empresaId: string,
  dispositivoId: string,
  revision: DispositivoRevision,
  usuarioId: string,
  nota?: string | null
): Promise<EscaneoDispositivoRow> {
  const sql = getSql();
  const [row] = await sql<EscaneoDispositivoRow[]>`
    UPDATE escaneo_dispositivo d SET
      revision = ${revision},
      revisado_por = CASE
        WHEN ${revision} = 'sin_revisar' THEN NULL
        ELSE ${usuarioId}::uuid
      END,
      revisado_at = CASE
        WHEN ${revision} = 'sin_revisar' THEN NULL
        ELSE now()
      END,
      nota_tecnico = CASE
        WHEN ${nota !== undefined} THEN ${nota ?? null}
        ELSE d.nota_tecnico
      END,
      updated_at = now()
    WHERE d.id = ${dispositivoId}
      AND EXISTS (
        SELECT 1
        FROM escaneo e
        JOIN audit a ON a.id = e.audit_id
        WHERE e.id = d.escaneo_id
          AND a.empresa_id = ${empresaId}
      )
    RETURNING *
  `;
  if (!row) throw new EscaneoNotFoundError('Dispositivo no encontrado');
  return row;
}

// Job de sistema (R7): sin empresaId, no se expone a rutas. `updated_at` se
// toca en cada chunk recibido, así que 24h sin actividad = escaneo colgado.
export async function escaneosColgados(): Promise<EscaneoRow[]> {
  const sql = getSql();
  return sql<EscaneoRow[]>`
    SELECT *
    FROM escaneo
    WHERE estado IN ('en_curso', 'sincronizando')
      AND updated_at < now() - interval '24 hours'
    ORDER BY updated_at ASC
  `;
}
