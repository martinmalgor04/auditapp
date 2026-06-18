-- migrations/020_audit_assignment.sql
-- Feature #32: asignación de auditoría por área (un técnico por audit_type) +
-- estado de confirmación del CAB compartido. Idempotente.
-- NO auto-registra en schema_migration (lo hace el runner migrate.ts).

-- (R1) Tabla de asignación por área.
CREATE TABLE IF NOT EXISTS audit_assignment (
  audit_id   uuid NOT NULL REFERENCES audit(id) ON DELETE CASCADE,
  audit_type text NOT NULL CHECK (audit_type IN ('it', 'erp-tango', 'erp-estandar')),
  tech_id    uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id, audit_type)          -- (R1) unicidad por (audit_id, audit_type)
);

CREATE INDEX IF NOT EXISTS audit_assignment_tech_id_idx ON audit_assignment (tech_id);

-- (R5) Estado explícito "CAB confirmado" en audit (idempotente).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit' AND column_name = 'cab_confirmed_by'
  ) THEN
    ALTER TABLE audit ADD COLUMN cab_confirmed_by uuid REFERENCES app_user(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit' AND column_name = 'cab_confirmed_at'
  ) THEN
    ALTER TABLE audit ADD COLUMN cab_confirmed_at timestamptz;
  END IF;
END $$;

-- (R2, R3, R4, R26) Backfill desde assigned_tech_id: una fila por tipo del array.
-- No toca assigned_tech_id (R4). El CAB queda no confirmado (cab_confirmed_* nulos).
INSERT INTO audit_assignment (audit_id, audit_type, tech_id)
SELECT a.id, t.audit_type, a.assigned_tech_id
FROM audit a
CROSS JOIN LATERAL unnest(a.types) AS t(audit_type)
WHERE a.assigned_tech_id IS NOT NULL
ON CONFLICT (audit_id, audit_type) DO NOTHING;
