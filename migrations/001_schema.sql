-- auditapp schema v1 — 02_modelo_datos feature #2
-- Tablas de definición, instancia, auth y tracking de migraciones.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Auth (app_user antes de audit por FKs)
CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'tecnico')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Definición de plantillas (data-driven)
CREATE TABLE template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE section (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES template(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  objective text,
  standard_ref text,
  weight text NOT NULL CHECK (weight IN ('bajo', 'medio', 'alto', 'muy_alto')),
  has_score boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL,
  UNIQUE (template_id, code)
);

CREATE TABLE template_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES section(id) ON DELETE CASCADE,
  label text NOT NULL,
  help_text text,
  method text[] NOT NULL DEFAULT '{}',
  field_type text NOT NULL CHECK (
    field_type IN (
      'text', 'number', 'bool', 'tri', 'select', 'multiselect',
      'date', 'datetime', 'list', 'table', 'file_ref', 'money'
    )
  ),
  options jsonb NOT NULL DEFAULT '{}',
  is_prefillable boolean NOT NULL DEFAULT false,
  prefill_source text CHECK (
    prefill_source IN ('briefing', 'dns', 'whois', 'registro_sys')
    OR prefill_source IS NULL
  ),
  filled_by text NOT NULL CHECK (filled_by IN ('admin', 'cliente', 'tecnico')),
  allow_na boolean NOT NULL DEFAULT false,
  required boolean NOT NULL DEFAULT false,
  scores boolean NOT NULL DEFAULT true,
  item_weight numeric NOT NULL DEFAULT 1 CHECK (item_weight >= 0),
  sort_order int NOT NULL,
  CONSTRAINT template_item_method_subset CHECK (
    method <@ ARRAY['O', 'E', 'C', 'X']::text[]
  )
);

-- Clientes
CREATE TABLE client (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social text NOT NULL,
  cuit text,
  rubro text,
  empleados int,
  puestos int,
  sedes int,
  referente_nombre text,
  referente_cargo text,
  referente_contacto text,
  erp_actual text,
  proveedor_correo text,
  soporte_it_actual text,
  direccion text,
  cp text,
  provincia text,
  telefono text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Instancia de auditoría
CREATE TABLE audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES client(id),
  name text NOT NULL,
  types text[] NOT NULL,
  template_ids uuid[] NOT NULL,
  segment text NOT NULL CHECK (segment IN ('A', 'B', 'C')),
  status text NOT NULL CHECK (
    status IN (
      'borrador', 'briefing_enviado', 'briefing_completo',
      'en_relevamiento', 'en_cierre', 'cerrada'
    )
  ),
  assigned_tech_id uuid REFERENCES app_user(id),
  created_by uuid REFERENCES app_user(id),
  scheduled_at timestamptz,
  public_token text UNIQUE,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_response (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audit(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES template_item(id),
  value jsonb NOT NULL DEFAULT 'null',
  na boolean NOT NULL DEFAULT false,
  observations text,
  source text NOT NULL CHECK (source IN ('admin', 'cliente', 'tecnico')),
  updated_by uuid REFERENCES app_user(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (audit_id, item_id)
);

CREATE TABLE audit_section_score (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audit(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES section(id),
  score int CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  score_breakdown jsonb NOT NULL DEFAULT '[]',
  observations text,
  UNIQUE (audit_id, section_id)
);

CREATE TABLE audit_closure (
  audit_id uuid PRIMARY KEY REFERENCES audit(id) ON DELETE CASCADE,
  indice_it int CHECK (indice_it IS NULL OR (indice_it >= 0 AND indice_it <= 100)),
  indice_erp int CHECK (indice_erp IS NULL OR (indice_erp >= 0 AND indice_erp <= 100)),
  top_risks jsonb NOT NULL DEFAULT '[]',
  quick_wins jsonb NOT NULL DEFAULT '[]',
  upsell_findings jsonb NOT NULL DEFAULT '[]',
  next_step text,
  closed_by uuid REFERENCES app_user(id),
  closed_at timestamptz
);

CREATE TABLE attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES audit(id) ON DELETE CASCADE,
  item_id uuid REFERENCES template_item(id),
  r2_key text NOT NULL UNIQUE,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  kind text NOT NULL CHECK (kind IN ('photo', 'export')),
  uploaded_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tracking de migraciones
CREATE TABLE IF NOT EXISTS schema_migration (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Índices de performance
CREATE INDEX audit_status_idx ON audit (status);
CREATE INDEX audit_client_id_idx ON audit (client_id);
CREATE INDEX audit_response_audit_id_idx ON audit_response (audit_id);
