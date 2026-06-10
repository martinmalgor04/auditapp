-- auditapp schema v3 — especialidades de técnico por tipo de auditoría

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS audit_types text[];

ALTER TABLE app_user DROP CONSTRAINT IF EXISTS app_user_audit_types_subset;
ALTER TABLE app_user ADD CONSTRAINT app_user_audit_types_subset CHECK (
  audit_types IS NULL OR audit_types <@ ARRAY['it', 'erp-tango', 'erp-estandar']::text[]
);

UPDATE app_user
SET audit_types = ARRAY['it']::text[]
WHERE email = 'facu@serviciosysistemas.com.ar';

UPDATE app_user
SET audit_types = ARRAY['erp-tango', 'erp-estandar']::text[]
WHERE email = 'simon@serviciosysistemas.com.ar';
