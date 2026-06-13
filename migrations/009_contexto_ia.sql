-- 009_contexto_ia.sql — Feature #17 17_contexto_ia
-- Flag ejemplar + trazabilidad de contexto enriquecido del pipeline IA.

ALTER TABLE audit_report
  ADD COLUMN IF NOT EXISTS ejemplar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS context_meta jsonb;

CREATE INDEX IF NOT EXISTS audit_report_ejemplar_idx
  ON audit_report (approved_at DESC)
  WHERE ejemplar AND status = 'aprobado';
