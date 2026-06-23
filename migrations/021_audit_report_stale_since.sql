-- #39 R12, R13: marca de informe desactualizado al reabrir una auditoría cerrada
ALTER TABLE audit_report
  ADD COLUMN IF NOT EXISTS stale_since timestamptz DEFAULT NULL;
