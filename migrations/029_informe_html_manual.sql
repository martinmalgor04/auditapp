-- #55 Informe HTML manual
-- Subida y entrega de HTML pulido a mano. Idempotente: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- Cubre R1–R3: source (origen de la versión: 'ia' | 'manual') + html_manual (documento subido).

-- R1: origen de la versión (default 'ia' para compatibilidad con versiones existentes del pipeline #14)
ALTER TABLE audit_report
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ia';

-- R2: documento HTML manual subido, guardado byte a byte
ALTER TABLE audit_report
  ADD COLUMN IF NOT EXISTS html_manual text;

-- R3: CHECK de coherencia: (source='manual' ⇔ html_manual IS NOT NULL)
-- Patrón idempotente: DROP IF + ADD
ALTER TABLE audit_report DROP CONSTRAINT IF EXISTS audit_report_source_check;
ALTER TABLE audit_report ADD CONSTRAINT audit_report_source_check
  CHECK (source IN ('ia', 'manual'));

ALTER TABLE audit_report DROP CONSTRAINT IF EXISTS audit_report_manual_coherence;
ALTER TABLE audit_report ADD CONSTRAINT audit_report_manual_coherence
  CHECK ((source = 'manual') = (html_manual IS NOT NULL));
