-- 026_servicio_email.sql — Feature #49 servicio_email
-- Log transaccional de envíos + opt-out de avisos internos por email. Idempotente.

CREATE TABLE IF NOT EXISTS email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  template text NOT NULL,
  status text NOT NULL CHECK (status IN ('enviado', 'fallido', 'dry_run')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS email_log_template_idx ON email_log (template);
CREATE INDEX IF NOT EXISTS email_log_created_idx ON email_log (created_at);

ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS notify_internal_email boolean NOT NULL DEFAULT true;
