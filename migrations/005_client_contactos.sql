-- auditapp schema v5 — origen de clientes + datos de licencia Tango y relevamiento de prospectos

ALTER TABLE client ADD COLUMN IF NOT EXISTS origen text;
ALTER TABLE client DROP CONSTRAINT IF EXISTS client_origen_check;
ALTER TABLE client ADD CONSTRAINT client_origen_check CHECK (
  origen IS NULL OR origen IN ('presupuestos', 'tango', 'prospecto')
);

-- Relevamiento comercial (prospectos)
ALTER TABLE client ADD COLUMN IF NOT EXISTS nivel_interes text;
ALTER TABLE client ADD COLUMN IF NOT EXISTS observaciones text;
ALTER TABLE client ADD COLUMN IF NOT EXISTS pagina text;
ALTER TABLE client ADD COLUMN IF NOT EXISTS relevado_at timestamptz;

-- Datos de licencia Tango (clientes fijos que renuevan)
ALTER TABLE client ADD COLUMN IF NOT EXISTS tango_tipo text;
ALTER TABLE client ADD COLUMN IF NOT EXISTS tango_terminales int;
ALTER TABLE client ADD COLUMN IF NOT EXISTS tango_version text;
ALTER TABLE client ADD COLUMN IF NOT EXISTS tango_version_detectada text;
ALTER TABLE client ADD COLUMN IF NOT EXISTS tango_lic_categoria text;
ALTER TABLE client ADD COLUMN IF NOT EXISTS tango_sueldos boolean;
ALTER TABLE client ADD COLUMN IF NOT EXISTS tango_venc_escala date;
ALTER TABLE client ADD COLUMN IF NOT EXISTS tango_motivo text;

-- Los clientes ya cargados vienen del export de presupuestos.serviciosysistemas.com.ar
UPDATE client SET origen = 'presupuestos' WHERE origen IS NULL;
