-- auditapp schema v2 — 04_backoffice feature #4
-- Borrado lógico de auditorías.

ALTER TABLE audit ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS audit_archived_at_idx ON audit (archived_at)
  WHERE archived_at IS NULL;
