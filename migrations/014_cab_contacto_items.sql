-- auditapp schema v14 — #22 cab_contacto_cliente
-- Agrega Dirección, Teléfono y Email a la sección CAB de los 3 templates activos.
--
-- Estrategia:
--   1. Se obtiene el section_id por join template -> section WHERE code = 'CAB'.
--   2. Se desplaza "Fecha programada de visita" al sort_order nuevo (mayor) para
--      dejar espacio a los 3 ítems antes de ella.
--   3. Se insertan Dirección, Teléfono, Email con UUIDs fijos y ON CONFLICT DO NOTHING
--      para garantizar idempotencia.
--
-- sort_orders resultantes por template:
--   erp-tango-v3 : ...8=Soporte IT, 9=Módulos Tango, 10=Dirección, 11=Teléfono, 12=Email, 13=Fecha programada
--   erp-estandar-v1: ...8=Soporte IT, 9=Dirección, 10=Teléfono, 11=Email, 12=Fecha programada
--   it-v2           : ...8=Soporte IT, 9=Dirección, 10=Teléfono, 11=Email, 12=Fecha programada

-- ── erp-tango-v3 ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_section_id uuid;
BEGIN
  SELECT s.id INTO v_section_id
  FROM section s
  JOIN template t ON t.id = s.template_id
  WHERE t.code = 'erp-tango' AND t.version = 'v3' AND s.code = 'CAB'
  LIMIT 1;

  IF v_section_id IS NULL THEN
    RAISE NOTICE 'erp-tango v3 CAB section not found, skipping';
    RETURN;
  END IF;

  -- Desplazar "Fecha programada de visita" de sort_order 10 a 13
  UPDATE template_item
  SET sort_order = 13
  WHERE section_id = v_section_id
    AND label = 'Fecha programada de visita'
    AND sort_order = 10;

  -- Insertar Dirección (sort_order 10)
  INSERT INTO template_item (
    id, section_id, label, method, field_type, options,
    filled_by, allow_na, required, scores, item_weight, sort_order
  ) VALUES (
    'a1b2c3d4-0001-0001-0001-000000000001',
    v_section_id,
    'Dirección',
    ARRAY['O'],
    'text',
    '{}'::jsonb,
    'tecnico', false, false, false, 1, 10
  ) ON CONFLICT (id) DO NOTHING;

  -- Insertar Teléfono (sort_order 11)
  INSERT INTO template_item (
    id, section_id, label, method, field_type, options,
    filled_by, allow_na, required, scores, item_weight, sort_order
  ) VALUES (
    'a1b2c3d4-0001-0002-0001-000000000001',
    v_section_id,
    'Teléfono',
    ARRAY['O'],
    'text',
    '{}'::jsonb,
    'tecnico', false, false, false, 1, 11
  ) ON CONFLICT (id) DO NOTHING;

  -- Insertar Email (sort_order 12)
  INSERT INTO template_item (
    id, section_id, label, method, field_type, options,
    filled_by, allow_na, required, scores, item_weight, sort_order
  ) VALUES (
    'a1b2c3d4-0001-0003-0001-000000000001',
    v_section_id,
    'Email',
    ARRAY['O'],
    'text',
    '{}'::jsonb,
    'tecnico', false, false, false, 1, 12
  ) ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ── erp-estandar-v1 ──────────────────────────────────────────────────────────

DO $$
DECLARE
  v_section_id uuid;
BEGIN
  SELECT s.id INTO v_section_id
  FROM section s
  JOIN template t ON t.id = s.template_id
  WHERE t.code = 'erp-estandar' AND t.version = 'v1' AND s.code = 'CAB'
  LIMIT 1;

  IF v_section_id IS NULL THEN
    RAISE NOTICE 'erp-estandar v1 CAB section not found, skipping';
    RETURN;
  END IF;

  -- Desplazar "Fecha programada de visita" de sort_order 9 a 12
  UPDATE template_item
  SET sort_order = 12
  WHERE section_id = v_section_id
    AND label = 'Fecha programada de visita'
    AND sort_order = 9;

  -- Insertar Dirección (sort_order 9)
  INSERT INTO template_item (
    id, section_id, label, method, field_type, options,
    filled_by, allow_na, required, scores, item_weight, sort_order
  ) VALUES (
    'a1b2c3d4-0002-0001-0001-000000000001',
    v_section_id,
    'Dirección',
    ARRAY['O'],
    'text',
    '{}'::jsonb,
    'tecnico', false, false, false, 1, 9
  ) ON CONFLICT (id) DO NOTHING;

  -- Insertar Teléfono (sort_order 10)
  INSERT INTO template_item (
    id, section_id, label, method, field_type, options,
    filled_by, allow_na, required, scores, item_weight, sort_order
  ) VALUES (
    'a1b2c3d4-0002-0002-0001-000000000001',
    v_section_id,
    'Teléfono',
    ARRAY['O'],
    'text',
    '{}'::jsonb,
    'tecnico', false, false, false, 1, 10
  ) ON CONFLICT (id) DO NOTHING;

  -- Insertar Email (sort_order 11)
  INSERT INTO template_item (
    id, section_id, label, method, field_type, options,
    filled_by, allow_na, required, scores, item_weight, sort_order
  ) VALUES (
    'a1b2c3d4-0002-0003-0001-000000000001',
    v_section_id,
    'Email',
    ARRAY['O'],
    'text',
    '{}'::jsonb,
    'tecnico', false, false, false, 1, 11
  ) ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ── it-v2 ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_section_id uuid;
BEGIN
  SELECT s.id INTO v_section_id
  FROM section s
  JOIN template t ON t.id = s.template_id
  WHERE t.code = 'it' AND t.version = 'v2' AND s.code = 'CAB'
  LIMIT 1;

  IF v_section_id IS NULL THEN
    RAISE NOTICE 'it v2 CAB section not found, skipping';
    RETURN;
  END IF;

  -- Desplazar "Fecha programada de visita" de sort_order 9 a 12
  UPDATE template_item
  SET sort_order = 12
  WHERE section_id = v_section_id
    AND label = 'Fecha programada de visita'
    AND sort_order = 9;

  -- Insertar Dirección (sort_order 9)
  INSERT INTO template_item (
    id, section_id, label, method, field_type, options,
    filled_by, allow_na, required, scores, item_weight, sort_order
  ) VALUES (
    'a1b2c3d4-0003-0001-0001-000000000001',
    v_section_id,
    'Dirección',
    ARRAY['O'],
    'text',
    '{}'::jsonb,
    'tecnico', false, false, false, 1, 9
  ) ON CONFLICT (id) DO NOTHING;

  -- Insertar Teléfono (sort_order 10)
  INSERT INTO template_item (
    id, section_id, label, method, field_type, options,
    filled_by, allow_na, required, scores, item_weight, sort_order
  ) VALUES (
    'a1b2c3d4-0003-0002-0001-000000000001',
    v_section_id,
    'Teléfono',
    ARRAY['O'],
    'text',
    '{}'::jsonb,
    'tecnico', false, false, false, 1, 10
  ) ON CONFLICT (id) DO NOTHING;

  -- Insertar Email (sort_order 11)
  INSERT INTO template_item (
    id, section_id, label, method, field_type, options,
    filled_by, allow_na, required, scores, item_weight, sort_order
  ) VALUES (
    'a1b2c3d4-0003-0003-0001-000000000001',
    v_section_id,
    'Email',
    ARRAY['O'],
    'text',
    '{}'::jsonb,
    'tecnico', false, false, false, 1, 11
  ) ON CONFLICT (id) DO NOTHING;
END;
$$;
