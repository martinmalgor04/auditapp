import { getSql } from './client';

export type SurveyResponseRow = {
  id: string;
  shareId: string;
  valoracionGlobal: number;
  claridadInforme: number;
  conformeHallazgos: boolean;
  comentario: string | null;
  submittedAt: Date;
};

const SURVEY_COLUMNS = `
  id, share_id, valoracion_global, claridad_informe, conforme_hallazgos, comentario, submitted_at
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>): SurveyResponseRow {
  return {
    id: row.id,
    shareId: row.share_id,
    valoracionGlobal: row.valoracion_global,
    claridadInforme: row.claridad_informe,
    conformeHallazgos: row.conforme_hallazgos,
    comentario: row.comentario,
    submittedAt: row.submitted_at
  };
}

/**
 * Inserta una respuesta de encuesta para un share (R6, R8). El índice único
 * `survey_response_share_uq` captura el doble envío (Postgres 23505); el caller
 * mapea ese conflicto a estado `already_answered`.
 */
export async function insertSurveyResponse(input: {
  shareId: string;
  valoracionGlobal: number;
  claridadInforme: number;
  conformeHallazgos: boolean;
  comentario: string | null;
}): Promise<SurveyResponseRow> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `INSERT INTO survey_response
       (share_id, valoracion_global, claridad_informe, conforme_hallazgos, comentario)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${SURVEY_COLUMNS}`,
    [
      input.shareId,
      input.valoracionGlobal,
      input.claridadInforme,
      input.conformeHallazgos,
      input.comentario
    ]
  );
  return mapRow(rows[0]);
}

/** Respuesta de un share puntual (token público), o null si no respondió aún. */
export async function getSurveyByShareId(shareId: string): Promise<SurveyResponseRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `SELECT ${SURVEY_COLUMNS} FROM survey_response WHERE share_id = $1 LIMIT 1`,
    [shareId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Respuesta del share activo (no revocado) de un informe, para el backoffice (R9).
 * Join `survey_response` → `audit_report_share` por share_id, filtrando el report.
 */
export async function getSurveyByActiveShare(
  reportId: string
): Promise<SurveyResponseRow | null> {
  const sql = getSql();
  const rows = await sql.unsafe(
    `SELECT sr.id, sr.share_id, sr.valoracion_global, sr.claridad_informe,
            sr.conforme_hallazgos, sr.comentario, sr.submitted_at
     FROM survey_response sr
     JOIN audit_report_share s ON s.id = sr.share_id
     WHERE s.report_id = $1 AND s.revoked_at IS NULL
     ORDER BY sr.submitted_at DESC
     LIMIT 1`,
    [reportId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}
