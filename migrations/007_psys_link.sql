-- 007_psys_link.sql — Feature #16 16_presupuesto_psys
-- Vínculo auditapp ↔ presupuestossys por informe aprobado.

CREATE TABLE audit_proposal_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audit(id),
  report_id uuid NOT NULL REFERENCES audit_report(id),
  status text NOT NULL DEFAULT 'activo',
  proposal_id uuid,
  number_display text,
  proposal_url text,
  psys_status text,
  contract_version text NOT NULL,
  sent_payload jsonb NOT NULL,
  error_message text,
  created_by uuid NOT NULL REFERENCES app_user(id),
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_proposal_link_status_check CHECK (status IN ('activo', 'error')),
  CONSTRAINT audit_proposal_link_error_coherence CHECK (
    (status = 'error' AND error_message IS NOT NULL AND error_message <> '')
    OR (status = 'activo' AND proposal_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX audit_proposal_link_active_uq
  ON audit_proposal_link (audit_id, report_id) WHERE status = 'activo';

CREATE INDEX audit_proposal_link_audit_idx ON audit_proposal_link (audit_id);
