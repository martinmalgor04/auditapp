-- 004_informe_ia.sql — Feature #14 14_informe_ia
-- Tabla audit_report (informes IA versionados) + audit_report_edit (historial append-only).

CREATE TABLE audit_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audit(id),
  version int NOT NULL CHECK (version >= 1),
  status text NOT NULL DEFAULT 'pendiente',
  canonical_json jsonb NOT NULL,
  schema_version text NOT NULL,
  client_draft jsonb,
  internal_draft jsonb,
  prompt_version text,
  model text,
  error_message text,
  loom_url text,
  requested_by uuid NOT NULL REFERENCES app_user(id),
  edited_by uuid REFERENCES app_user(id),
  edited_at timestamptz,
  approved_by uuid REFERENCES app_user(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_report_audit_version_uq UNIQUE (audit_id, version),
  CONSTRAINT audit_report_status_check CHECK (
    status IN ('pendiente', 'generando', 'borrador', 'aprobado', 'error')
  ),
  CONSTRAINT audit_report_approved_coherence CHECK (
    status <> 'aprobado' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  CONSTRAINT audit_report_error_coherence CHECK (
    status <> 'error' OR (error_message IS NOT NULL AND error_message <> '')
  )
);

CREATE INDEX audit_report_audit_idx ON audit_report (audit_id);
CREATE INDEX audit_report_inflight_idx ON audit_report (status, updated_at)
  WHERE status IN ('pendiente', 'generando');

-- Historial de ediciones append-only (R31). Solo INSERT y SELECT.
CREATE TABLE audit_report_edit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES audit_report(id),
  seq int NOT NULL CHECK (seq >= 1),
  client_draft jsonb NOT NULL,
  change_summary text NOT NULL,
  edited_by uuid NOT NULL REFERENCES app_user(id),
  edited_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_report_edit_seq_uq UNIQUE (report_id, seq)
);

CREATE INDEX audit_report_edit_report_idx ON audit_report_edit (report_id);
