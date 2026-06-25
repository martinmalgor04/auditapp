-- 025_encuesta_conformidad.sql — Feature #47 47_encuesta_conformidad
-- Encuesta de conformidad embebida al pie del informe público (#15). La respuesta
-- cuelga del share (token) que el cliente realmente vio; a lo sumo una respuesta por
-- share, inmutable (sin edición ni borrado). Idempotente y re-ejecutable.

CREATE TABLE IF NOT EXISTS survey_response (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL REFERENCES audit_report_share(id),
  valoracion_global smallint NOT NULL CHECK (valoracion_global BETWEEN 1 AND 5),
  claridad_informe smallint NOT NULL CHECK (claridad_informe BETWEEN 1 AND 5),
  conforme_hallazgos boolean NOT NULL,
  comentario text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

-- A lo sumo una respuesta por share (R6): el segundo INSERT viola el UNIQUE.
CREATE UNIQUE INDEX IF NOT EXISTS survey_response_share_uq
  ON survey_response (share_id);
