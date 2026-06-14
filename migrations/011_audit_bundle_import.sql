-- auditapp schema v11 — #20 export/import de auditorías
-- Tabla de dedupe para idempotencia del import de bundles (R13).
-- PK natural {origin_instance_id, origin_audit_id}: identifica un bundle de forma estable
-- entre instancias, independiente de los UUID locales generados en destino.

CREATE TABLE IF NOT EXISTS audit_bundle_import (
  origin_instance_id text NOT NULL,
  origin_audit_id uuid NOT NULL,
  audit_id uuid NOT NULL REFERENCES audit(id) ON DELETE CASCADE,
  imported_by uuid REFERENCES app_user(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (origin_instance_id, origin_audit_id)
);

CREATE INDEX IF NOT EXISTS audit_bundle_import_audit_id_idx
  ON audit_bundle_import (audit_id);
