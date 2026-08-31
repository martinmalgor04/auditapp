/**
 * #62 — Mutaciones de revisión por GRUPO de identidad (la decisión humana es
 * sobre el dispositivo físico, no sobre cada ocurrencia). `empresaId` es
 * primer parámetro y se aplica en la misma query vía join escaneo → audit
 * (R27/R28). `audit_response` jamás se escribe (R23): la fusión es un
 * puntero desde el dispositivo hacia la fila manual, no una copia.
 */
import { getSql } from '$lib/server/db/client';
import { ValidationError } from '$lib/server/backoffice/errors';
import { EscaneoNotFoundError, VinculoRelevamientoInvalidoError } from './errors';
import type { DispositivoRevision } from './schemas';

/**
 * R20/R26: aplica la revisión a TODAS las ocurrencias del grupo
 * `(audit_id, identidad)` registrando quién/cuándo y nota opcional.
 * `sin_revisar` limpia revisor y fecha (semántica de `marcarRevision` de #59).
 * Toda revisión no-fusión limpia el vínculo (invariante fusión⟺vínculo).
 * Devuelve la cantidad de ocurrencias actualizadas; 0 → not found.
 */
export async function marcarRevisionGrupo(
  empresaId: string,
  auditId: string,
  identidad: string,
  revision: Exclude<DispositivoRevision, 'fusionado'>,
  usuarioId: string,
  nota?: string | null
): Promise<number> {
  if ((revision as DispositivoRevision) === 'fusionado') {
    throw new ValidationError('Para fusionar usá fusionarDispositivo (exige ítem y fila destino)');
  }
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    UPDATE escaneo_dispositivo d SET
      revision = ${revision},
      revisado_por = CASE WHEN ${revision} = 'sin_revisar' THEN NULL
                          ELSE ${usuarioId}::uuid END,
      revisado_at  = CASE WHEN ${revision} = 'sin_revisar' THEN NULL
                          ELSE now() END,
      nota_tecnico = CASE WHEN ${nota !== undefined} THEN ${nota ?? null}
                          ELSE d.nota_tecnico END,
      relevamiento_item_id = NULL,
      relevamiento_row_id  = NULL,
      updated_at = now()
    WHERE d.identidad = ${identidad}
      AND EXISTS (
        SELECT 1
        FROM escaneo e
        JOIN audit a ON a.id = e.audit_id
        WHERE e.id = d.escaneo_id
          AND e.audit_id = ${auditId}
          AND a.empresa_id = ${empresaId}
      )
    RETURNING d.id
  `;
  if (rows.length === 0) throw new EscaneoNotFoundError('Dispositivo no encontrado');
  return rows.length;
}

/**
 * R21/R22: fusiona el grupo con una fila del relevamiento manual. Valida en
 * la misma tx que el ítem sea `field_type='table'` de la plantilla de ESTA
 * auditoría y que `rowId` exista en `value.rows`; si no, rechaza sin mutar
 * nada. Setea vínculo + `fusionado` en todas las ocurrencias.
 */
export async function fusionarDispositivo(
  empresaId: string,
  auditId: string,
  identidad: string,
  itemId: string,
  rowId: string,
  usuarioId: string,
  nota?: string | null
): Promise<number> {
  const sql = getSql();
  return sql.begin(async (tx) => {
    const [destino] = await tx<{ ok: number }[]>`
      SELECT 1 AS ok
      FROM audit a
      JOIN section s       ON s.template_id = ANY(a.template_ids)
      JOIN template_item ti ON ti.section_id = s.id AND ti.field_type = 'table'
      JOIN audit_response ar ON ar.audit_id = a.id AND ar.item_id = ti.id
      WHERE a.id = ${auditId}
        AND a.empresa_id = ${empresaId}
        AND ti.id = ${itemId}
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(ar.value->'rows') r
          WHERE r->>'row_id' = ${rowId}
        )
    `;
    if (!destino) throw new VinculoRelevamientoInvalidoError();

    const rows = await tx<{ id: string }[]>`
      UPDATE escaneo_dispositivo d SET
        revision = 'fusionado',
        revisado_por = ${usuarioId}::uuid,
        revisado_at  = now(),
        nota_tecnico = CASE WHEN ${nota !== undefined} THEN ${nota ?? null}
                            ELSE d.nota_tecnico END,
        relevamiento_item_id = ${itemId}::uuid,
        relevamiento_row_id  = ${rowId},
        updated_at = now()
      WHERE d.identidad = ${identidad}
        AND EXISTS (
          SELECT 1
          FROM escaneo e
          JOIN audit a ON a.id = e.audit_id
          WHERE e.id = d.escaneo_id
            AND e.audit_id = ${auditId}
            AND a.empresa_id = ${empresaId}
        )
      RETURNING d.id
    `;
    if (rows.length === 0) throw new EscaneoNotFoundError('Dispositivo no encontrado');
    return rows.length;
  });
}

/**
 * R24: limpia el vínculo y devuelve a `sin_revisar` (sin revisor ni fecha)
 * las ocurrencias del grupo que tenían ese vínculo. 0 filas → not found.
 */
export async function desvincularDispositivo(
  empresaId: string,
  auditId: string,
  identidad: string
): Promise<number> {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    UPDATE escaneo_dispositivo d SET
      relevamiento_item_id = NULL,
      relevamiento_row_id  = NULL,
      revision      = 'sin_revisar',
      revisado_por  = NULL,
      revisado_at   = NULL,
      updated_at    = now()
    WHERE d.identidad = ${identidad}
      AND d.relevamiento_item_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM escaneo e
        JOIN audit a ON a.id = e.audit_id
        WHERE e.id = d.escaneo_id
          AND e.audit_id = ${auditId}
          AND a.empresa_id = ${empresaId}
      )
    RETURNING d.id
  `;
  if (rows.length === 0) throw new EscaneoNotFoundError('Dispositivo no encontrado');
  return rows.length;
}
