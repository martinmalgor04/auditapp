-- auditapp schema v22 — #41 referencia_auditoria
-- empresa.codigo, audit.ref_code, audit_ref_counter, backfill, inmutabilidad.
-- Idempotente: IF NOT EXISTS / WHERE ... IS NULL.

-- ── Normalización de texto (sin extensión unaccent).
CREATE OR REPLACE FUNCTION auditapp_normalize_text(input text) RETURNS text AS $$
BEGIN
  RETURN upper(
    trim(
      regexp_replace(
        translate(
          coalesce(input, ''),
          'áàäâãÁÀÄÂÃéèëêÉÈËÊíìïîÍÌÏÎóòöôõÓÒÖÔÕúùüûÚÙÜÛñÑ',
          'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUnN'
        ),
        '\s+',
        ' ',
        'g'
      )
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Código base de empresa (réplica de buildEmpresaCode TS, R1).
CREATE OR REPLACE FUNCTION build_empresa_code(razon_social text) RETURNS text AS $$
DECLARE
  normalized text;
  tokens text[];
  token text;
  result text := '';
  first_sig text := NULL;
  stopwords text[] := ARRAY[
    'SA','S.A.','SRL','S.R.L.','SAS','SOCIEDAD','RESPONSABILIDAD','LIMITADA',
    'ANONIMA','ANÓNIMA','DE','DEL','LA','LAS','EL','LOS','Y','E'
  ];
BEGIN
  normalized := auditapp_normalize_text(razon_social);
  tokens := string_to_array(normalized, ' ');

  FOREACH token IN ARRAY tokens LOOP
    IF token IS NULL OR token = '' THEN CONTINUE; END IF;
    IF token = ANY(stopwords) OR replace(token, '.', '') = ANY(
      SELECT replace(unnest(stopwords), '.', '')
    ) THEN
      CONTINUE;
    END IF;
    IF first_sig IS NULL THEN first_sig := token; END IF;
    result := result || left(token, 1);
    IF length(result) >= 5 THEN EXIT; END IF;
  END LOOP;

  IF length(result) < 3 AND first_sig IS NOT NULL THEN
    result := result || substr(first_sig, 2, 3 - length(result));
  END IF;

  RETURN left(coalesce(result, 'EMP'), 5);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Columnas nuevas.
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS codigo text;
ALTER TABLE audit ADD COLUMN IF NOT EXISTS ref_code text;

-- ── Backfill empresa.codigo (R10).
WITH base AS (
  SELECT
    id,
    build_empresa_code(razon_social) AS base_code,
    created_at
  FROM empresa
  WHERE codigo IS NULL
),
ranked AS (
  SELECT
    id,
    base_code,
    row_number() OVER (PARTITION BY base_code ORDER BY created_at, id) AS rn
  FROM base
)
UPDATE empresa e
SET codigo = CASE
  WHEN r.rn = 1 THEN r.base_code
  ELSE r.base_code || (r.rn)::text
END
FROM ranked r
WHERE e.id = r.id;

-- ── Tabla contador (R8, R13).
CREATE TABLE IF NOT EXISTS audit_ref_counter (
  empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  audit_type text NOT NULL CHECK (audit_type IN ('it', 'erp-tango', 'erp-estandar')),
  last_seq int NOT NULL CHECK (last_seq >= 1),
  PRIMARY KEY (empresa_id, audit_type)
);

-- ── Backfill audit.ref_code (R11, R12).
WITH lead_type AS (
  SELECT
    a.id,
    a.empresa_id,
    a.created_at,
    CASE
      WHEN 'it' = ANY(a.types) THEN 'it'
      WHEN 'erp-tango' = ANY(a.types) THEN 'erp-tango'
      ELSE 'erp-estandar'
    END AS audit_type
  FROM audit a
  WHERE a.ref_code IS NULL
),
numbered AS (
  SELECT
    lt.id,
    lt.empresa_id,
    lt.audit_type,
    row_number() OVER (
      PARTITION BY lt.empresa_id, lt.audit_type
      ORDER BY lt.created_at, lt.id
    ) AS seq
  FROM lead_type lt
),
composed AS (
  SELECT
    n.id,
    e.codigo || '-' ||
    CASE n.audit_type
      WHEN 'it' THEN 'IT'
      WHEN 'erp-tango' THEN 'ERP'
      ELSE 'ERPE'
    END || '-' ||
    lpad(n.seq::text, 4, '0') AS ref_code
  FROM numbered n
  JOIN empresa e ON e.id = n.empresa_id
)
UPDATE audit a
SET ref_code = c.ref_code
FROM composed c
WHERE a.id = c.id;

-- ── Seed contador con máximo correlativo (R13).
INSERT INTO audit_ref_counter (empresa_id, audit_type, last_seq)
SELECT
  a.empresa_id,
  CASE
    WHEN 'it' = ANY(a.types) THEN 'it'
    WHEN 'erp-tango' = ANY(a.types) THEN 'erp-tango'
    ELSE 'erp-estandar'
  END AS audit_type,
  max(
    (regexp_match(
      a.ref_code,
      '-(\d{4})$'
    ))[1]::int
  ) AS last_seq
FROM audit a
WHERE a.ref_code IS NOT NULL
GROUP BY 1, 2
ON CONFLICT (empresa_id, audit_type) DO UPDATE
SET last_seq = GREATEST(audit_ref_counter.last_seq, EXCLUDED.last_seq);

-- ── NOT NULL + UNIQUE.
ALTER TABLE empresa ALTER COLUMN codigo SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS empresa_codigo_unique ON empresa (codigo);

ALTER TABLE audit ALTER COLUMN ref_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS audit_ref_code_unique ON audit (ref_code);

-- ── Triggers de inmutabilidad (R3, R9).
CREATE OR REPLACE FUNCTION empresa_codigo_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.codigo IS NOT NULL AND OLD.codigo IS DISTINCT FROM NEW.codigo THEN
    RAISE EXCEPTION 'empresa.codigo es inmutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_empresa_codigo_immutable ON empresa;
CREATE TRIGGER trg_empresa_codigo_immutable
  BEFORE UPDATE ON empresa
  FOR EACH ROW
  EXECUTE FUNCTION empresa_codigo_immutable();

CREATE OR REPLACE FUNCTION audit_ref_code_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.ref_code IS DISTINCT FROM NEW.ref_code THEN
    RAISE EXCEPTION 'audit.ref_code es inmutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_ref_code_immutable ON audit;
CREATE TRIGGER trg_audit_ref_code_immutable
  BEFORE UPDATE ON audit
  FOR EACH ROW
  EXECUTE FUNCTION audit_ref_code_immutable();

-- Refrescar vista client (SELECT * no hereda columnas nuevas en Postgres).
CREATE OR REPLACE VIEW client AS SELECT * FROM empresa;
