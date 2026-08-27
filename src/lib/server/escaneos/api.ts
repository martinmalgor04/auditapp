import { randomBytes } from 'node:crypto';
import { getSql } from '$lib/server/db/client';
import { hashToken } from '$lib/server/auth/password-reset';

export const ESCANEO_TOKEN_TTL_HORAS = 12;
export const AGENTE_MAJOR_SOPORTADO = 1;

export type AmbitoEscaneo = {
  escaneoId: string;
  auditId: string;
  empresaId: string;
};

export type ResolucionTokenEscaneo =
  | { ok: true; escaneoId: string; empresaId: string }
  | { ok: false; reason: 'not_found' | 'revoked' | 'expired' };

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Ámbito para rutas staff (emisión/revocación) y el job: null si no existe. */
export async function resolverAmbitoEscaneo(escaneoId: string): Promise<AmbitoEscaneo | null> {
  if (!UUID_RE.test(escaneoId)) return null;
  const sql = getSql();
  const [row] = await sql<{ id: string; audit_id: string; empresa_id: string }[]>`
    SELECT e.id, e.audit_id, a.empresa_id
    FROM escaneo e
    JOIN audit a ON a.id = e.audit_id
    WHERE e.id = ${escaneoId}
  `;
  if (!row) return null;
  return { escaneoId: row.id, auditId: row.audit_id, empresaId: row.empresa_id };
}

/** Empresa dueña de una auditoría (para `POST /api/escaneos`); null si no existe. */
export async function resolverEmpresaDeAuditoria(auditId: string): Promise<string | null> {
  const sql = getSql();
  const [row] = await sql<{ empresa_id: string }[]>`
    SELECT empresa_id FROM audit WHERE id = ${auditId}
  `;
  return row?.empresa_id ?? null;
}

/**
 * Emite token: revoca el activo (R3), inserta solo el hash (R1) y devuelve el
 * claro UNA vez (R5). TTL 12 h (R2). Transacción: el índice parcial
 * `escaneo_token_activo_uq` garantiza un solo token activo por escaneo.
 */
export async function emitirTokenEscaneo(
  escaneoId: string,
  usuarioId: string
): Promise<{ token: string; expiresAt: Date }> {
  const sql = getSql();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);

  const expiresAt = await sql.begin(async (tx) => {
    await tx`
      UPDATE escaneo_token SET revoked_at = now()
      WHERE escaneo_id = ${escaneoId} AND revoked_at IS NULL
    `;
    const [row] = await tx<{ expires_at: Date }[]>`
      INSERT INTO escaneo_token (escaneo_id, token_hash, creado_por, expires_at)
      VALUES (
        ${escaneoId}, ${tokenHash}, ${usuarioId},
        now() + ${ESCANEO_TOKEN_TTL_HORAS} * interval '1 hour'
      )
      RETURNING expires_at
    `;
    return row.expires_at;
  });

  return { token, expiresAt };
}

/** Revocación idempotente (R4): el historial de emisiones se conserva. */
export async function revocarTokenEscaneo(escaneoId: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE escaneo_token SET revoked_at = now()
    WHERE escaneo_id = ${escaneoId} AND revoked_at IS NULL
  `;
}

/**
 * Resolución para el guard (patrón `resolveResetToken` de #50): unión
 * discriminada para que el guard loguee el motivo categorizado (R30) sin
 * exponerlo al cliente (R7: mismo 401 para las tres causas).
 */
export async function resolverTokenEscaneo(tokenClaro: string): Promise<ResolucionTokenEscaneo> {
  const sql = getSql();
  const [row] = await sql<
    { escaneo_id: string; empresa_id: string; revoked_at: Date | null; expires_at: Date }[]
  >`
    SELECT t.escaneo_id, a.empresa_id, t.revoked_at, t.expires_at
    FROM escaneo_token t
    JOIN escaneo e ON e.id = t.escaneo_id
    JOIN audit a ON a.id = e.audit_id
    WHERE t.token_hash = ${hashToken(tokenClaro)}
  `;
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.revoked_at !== null) return { ok: false, reason: 'revoked' };
  if (row.expires_at <= new Date()) return { ok: false, reason: 'expired' };
  return { ok: true, escaneoId: row.escaneo_id, empresaId: row.empresa_id };
}

/**
 * Persiste versión/hostname del agente cuando difieren (R21): lo que realmente
 * ejecutó manda sobre el placeholder de creación. No-op si nada cambió.
 */
export async function registrarAgente(
  empresaId: string,
  escaneoId: string,
  version: string,
  hostname?: string
): Promise<void> {
  const sql = getSql();
  const hostnameParam = hostname ?? null;
  await sql`
    UPDATE escaneo e SET
      agente_version = ${version},
      agente_hostname = CASE
        WHEN ${hostnameParam}::text IS NOT NULL THEN ${hostnameParam}::text
        ELSE e.agente_hostname
      END,
      updated_at = now()
    WHERE e.id = ${escaneoId}
      AND EXISTS (
        SELECT 1 FROM audit a
        WHERE a.id = e.audit_id AND a.empresa_id = ${empresaId}
      )
      AND (
        e.agente_version <> ${version}
        OR (${hostnameParam}::text IS NOT NULL AND e.agente_hostname IS DISTINCT FROM ${hostnameParam}::text)
      )
  `;
}

export type ContextoEscaneo = {
  empresa: { razonSocial: string; codigo: string };
  auditoria: { id: string; refCode: string };
};

/** Contexto de confirmación para el técnico en `GET /api/escaneos/[id]` (R11). */
export async function obtenerContextoEscaneo(
  empresaId: string,
  escaneoId: string
): Promise<ContextoEscaneo | null> {
  const sql = getSql();
  const [row] = await sql<
    { razon_social: string; codigo: string; audit_id: string; ref_code: string }[]
  >`
    SELECT em.razon_social, em.codigo, a.id AS audit_id, a.ref_code
    FROM escaneo e
    JOIN audit a ON a.id = e.audit_id
    JOIN empresa em ON em.id = a.empresa_id
    WHERE e.id = ${escaneoId}
      AND a.empresa_id = ${empresaId}
  `;
  if (!row) return null;
  return {
    empresa: { razonSocial: row.razon_social, codigo: row.codigo },
    auditoria: { id: row.audit_id, refCode: row.ref_code }
  };
}
