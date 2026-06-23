-- Auto-generar codigo/ref_code en INSERT cuando vienen NULL (tests + rutas legacy, #41).
CREATE OR REPLACE FUNCTION empresa_set_codigo_insert() RETURNS trigger AS $$
DECLARE
  base text;
  candidate text;
  n int := 0;
BEGIN
  IF NEW.codigo IS NOT NULL THEN
    RETURN NEW;
  END IF;
  base := build_empresa_code(NEW.razon_social);
  LOOP
    candidate := CASE WHEN n = 0 THEN base ELSE base || (n + 1)::text END;
    IF NOT EXISTS (SELECT 1 FROM empresa WHERE codigo = candidate) THEN
      NEW.codigo := candidate;
      RETURN NEW;
    END IF;
    n := n + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_empresa_codigo_insert ON empresa;
CREATE TRIGGER trg_empresa_codigo_insert
  BEFORE INSERT ON empresa
  FOR EACH ROW
  EXECUTE FUNCTION empresa_set_codigo_insert();

CREATE OR REPLACE FUNCTION audit_set_ref_code_insert() RETURNS trigger AS $$
DECLARE
  lead_type text;
  empresa_codigo text;
  seq int;
  tipo_token text;
BEGIN
  IF NEW.ref_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT codigo INTO empresa_codigo FROM empresa WHERE id = NEW.empresa_id;
  IF empresa_codigo IS NULL THEN
    RAISE EXCEPTION 'empresa sin codigo para ref_code';
  END IF;

  IF 'it' = ANY(NEW.types) THEN
    lead_type := 'it';
  ELSIF 'erp-tango' = ANY(NEW.types) THEN
    lead_type := 'erp-tango';
  ELSE
    lead_type := 'erp-estandar';
  END IF;

  INSERT INTO audit_ref_counter (empresa_id, audit_type, last_seq)
  VALUES (NEW.empresa_id, lead_type, 1)
  ON CONFLICT (empresa_id, audit_type)
  DO UPDATE SET last_seq = audit_ref_counter.last_seq + 1
  RETURNING last_seq INTO seq;

  tipo_token := CASE lead_type
    WHEN 'it' THEN 'IT'
    WHEN 'erp-tango' THEN 'ERP'
    ELSE 'ERPE'
  END;

  NEW.ref_code := empresa_codigo || '-' || tipo_token || '-' || lpad(seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_ref_code_insert ON audit;
CREATE TRIGGER trg_audit_ref_code_insert
  BEFORE INSERT ON audit
  FOR EACH ROW
  EXECUTE FUNCTION audit_set_ref_code_insert();
