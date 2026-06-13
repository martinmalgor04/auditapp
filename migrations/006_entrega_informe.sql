-- 006_entrega_informe.sql — Feature #15 15_entrega_informe
-- Links públicos de entrega del informe aprobado: token opaco, expiración,
-- revocación lógica (la fila nunca se borra) y contador de vistas.

CREATE TABLE audit_report_share (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES audit_report(id),
  token text NOT NULL UNIQUE,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  view_count int NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  first_viewed_at timestamptz,
  last_viewed_at timestamptz
);

-- A lo sumo un share activo (no revocado) por informe (R3).
CREATE UNIQUE INDEX audit_report_share_active_uq
  ON audit_report_share (report_id) WHERE revoked_at IS NULL;
CREATE INDEX audit_report_share_report_idx ON audit_report_share (report_id);
