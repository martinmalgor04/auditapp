CREATE TABLE crm_lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  empresa text NOT NULL,
  contacto text,
  telefono text,
  source text NOT NULL CHECK (source IN ('firecrawl', 'referido', 'manual', 'otro')),
  status text NOT NULL DEFAULT 'lead' CHECK (status IN (
    'lead', 'contactado', 'agendo', 'auditado', 'presupuestado', 'cliente', 'descartado'
  )),
  notas text,
  proxima_accion text,
  proxima_accion_fecha date,
  client_id uuid REFERENCES client(id),
  audit_id uuid REFERENCES audit(id),
  presupuesto_ref text,
  descartado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX crm_lead_email_key ON crm_lead (lower(email));
CREATE INDEX crm_lead_status_idx ON crm_lead (status);

CREATE TABLE crm_lead_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES crm_lead(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status text NOT NULL,
  changed_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_lead_event_lead_id_idx ON crm_lead_event (lead_id);
