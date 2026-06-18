-- migrations/019_a4_endurecimiento.sql
-- #29 endurecimiento_preguntas
-- Reemplaza los 2 ítems A4 de it-v2 por 5 preguntas observables con help_text.
--
-- Estrategia:
--   1. Resolver section_id por join template (code='it', version='v2') -> section (code='A4').
--   2. Borrar audit_response vinculadas a los 2 ítems viejos (FK lo exige; los datos
--      no tienen valor auditable — ver design §4 decisión final).
--   3. Borrar los 2 template_item viejos.
--   4. Insertar los 5 nuevos con UUIDs fijos y ON CONFLICT DO NOTHING (idempotencia).
--
-- Idempotencia: DELETE no falla si no hay filas; INSERT usa ON CONFLICT DO NOTHING.

DO $$
DECLARE
  v_section_id uuid;
BEGIN
  -- 1. Resolver section_id por clave natural (R9: nunca UUID hardcodeado de template/section)
  SELECT s.id INTO v_section_id
  FROM section s
  JOIN template t ON t.id = s.template_id
  WHERE t.code = 'it' AND t.version = 'v2' AND s.code = 'A4'
  LIMIT 1;

  IF v_section_id IS NULL THEN
    RAISE NOTICE 'it-v2 A4 section not found, skipping';
    RETURN;
  END IF;

  -- 2. Borrar audit_response vinculadas a los 2 ítems A4 viejos (requiere FK)
  DELETE FROM audit_response
  WHERE item_id IN (
    SELECT id FROM template_item
    WHERE section_id = v_section_id
      AND label IN (
        'Endurecimiento de servidores',
        '¿Se deshabilitan servicios innecesarios?'
      )
  );

  -- 3. Borrar los 2 template_item A4 viejos (R10)
  DELETE FROM template_item
  WHERE section_id = v_section_id
    AND label IN (
      'Endurecimiento de servidores',
      '¿Se deshabilitan servicios innecesarios?'
    );

  -- 4. Insertar los 5 ítems nuevos (R1, R2, R5, R6)

  -- Ítem A4-0: SO con soporte vigente (sort_order 0, field_type tri)
  INSERT INTO template_item (
    id, section_id, label, help_text, method, field_type, options,
    filled_by, allow_na, required, scores, item_weight, sort_order
  ) VALUES (
    'a4000001-0029-0001-a400-000000000001',
    v_section_id,
    '¿El sistema operativo del servidor tiene soporte vigente del fabricante?',
    'Verificar la versión de Windows Server o Linux instalada y contrastar con la tabla de fin de soporte del fabricante (Microsoft End of Support, Ubuntu LTS, RHEL). Si el SO ya no recibe parches de seguridad, responder ''no''. Si usa un programa de soporte extendido activo (ESU de Microsoft), responder ''parcial''.',
    ARRAY['O'],
    'tri',
    '{"score_map": {"si": 100, "parcial": 50, "no": 0}}'::jsonb,
    'tecnico', false, false, true, 1, 0
  ) ON CONFLICT (id) DO NOTHING;

  -- Ítem A4-1: Credenciales de fábrica eliminadas (sort_order 1, field_type tri)
  INSERT INTO template_item (
    id, section_id, label, help_text, method, field_type, options,
    filled_by, allow_na, required, scores, item_weight, sort_order
  ) VALUES (
    'a4000002-0029-0002-a400-000000000002',
    v_section_id,
    '¿Las credenciales de fábrica (usuarios y contraseñas predeterminados) fueron cambiadas o deshabilitadas?',
    'Revisar en el servidor si existen cuentas con nombres genéricos del fabricante aún activas: ''Administrator'' con contraseña de fábrica, cuentas de consola IPMI/iDRAC/iLO con clave predeterminada, usuarios por defecto de servicios (SQL Server ''sa'' habilitado con contraseña vacía o conocida, MySQL ''root'' sin contraseña). Preguntar al técnico de sistemas si los cambió. Si algunos sí y otros no, responder ''parcial''.',
    ARRAY['O'],
    'tri',
    '{"score_map": {"si": 100, "parcial": 50, "no": 0}}'::jsonb,
    'tecnico', false, false, true, 1, 1
  ) ON CONFLICT (id) DO NOTHING;

  -- Ítem A4-2: Acceso remoto protegido (sort_order 2, field_type select)
  INSERT INTO template_item (
    id, section_id, label, help_text, method, field_type, options,
    filled_by, allow_na, required, scores, item_weight, sort_order
  ) VALUES (
    'a4000003-0029-0003-a400-000000000003',
    v_section_id,
    '¿El acceso remoto al servidor (RDP, SSH) está protegido?',
    'Verificar cómo se accede remotamente al servidor: (a) si requiere conectarse primero a una VPN o está limitado a IPs específicas en el firewall → ''Sí, por VPN o IP restringida''; (b) si solo se cambió el puerto (ej. RDP en 3390 en vez de 3389) pero sigue expuesto a internet sin VPN → ''Sí, solo cambió el puerto''; (c) si el puerto estándar (3389 RDP, 22 SSH) está abierto directamente a internet sin restricción → ''No, expuesto directamente a internet''. Usar ''netstat -an'' o revisar el firewall para verificar puertos escuchando.',
    ARRAY['O'],
    'select',
    '{"choices": ["Sí, por VPN o IP restringida", "Sí, solo cambió el puerto", "No, expuesto directamente a internet"], "score_map": {"Sí, por VPN o IP restringida": 100, "Sí, solo cambió el puerto": 50, "No, expuesto directamente a internet": 0}}'::jsonb,
    'tecnico', false, false, true, 1, 2
  ) ON CONFLICT (id) DO NOTHING;

  -- Ítem A4-3: Servicios innecesarios apagados (sort_order 3, field_type tri)
  INSERT INTO template_item (
    id, section_id, label, help_text, method, field_type, options,
    filled_by, allow_na, required, scores, item_weight, sort_order
  ) VALUES (
    'a4000004-0029-0004-a400-000000000004',
    v_section_id,
    '¿El servidor tiene apagados los servicios y programas que no necesita?',
    'Revisar en el servidor los servicios activos con ''services.msc'' (Windows) o ''systemctl list-units --type=service --state=running'' (Linux). Buscar servicios que no cumplen ningún rol en este servidor: Telnet, FTP, SNMP con community string public, servidores web (IIS, Apache) si el servidor es de archivos, software de demostración del fabricante. Si hay varios servicios innecesarios activos, responder ''no''. Si hay uno o dos que no son críticos, ''parcial''. Si todo lo que corre tiene un propósito claro, ''si''.',
    ARRAY['O'],
    'tri',
    '{"score_map": {"si": 100, "parcial": 50, "no": 0}}'::jsonb,
    'tecnico', false, false, true, 1, 3
  ) ON CONFLICT (id) DO NOTHING;

  -- Ítem A4-4: Firewall del host activo (sort_order 4, field_type tri)
  INSERT INTO template_item (
    id, section_id, label, help_text, method, field_type, options,
    filled_by, allow_na, required, scores, item_weight, sort_order
  ) VALUES (
    'a4000005-0029-0005-a400-000000000005',
    v_section_id,
    '¿El firewall del propio servidor (Windows Firewall, iptables, ufw) está activo y configurado?',
    'Verificar el firewall de host, distinto al firewall perimetral de la red. En Windows: Panel de control → Sistema y seguridad → Firewall de Windows Defender → debe estar Activado para las 3 redes (dominio, privada, pública). En Linux: ejecutar ''ufw status'' o ''iptables -L''; si muestra ''inactive'' o política ACCEPT sin reglas específicas, no está configurado. Responder ''si'' si está activo con reglas que restringen acceso; ''no'' si está desactivado o sin reglas.',
    ARRAY['O'],
    'tri',
    '{"score_map": {"si": 100, "parcial": 50, "no": 0}}'::jsonb,
    'tecnico', false, false, true, 1, 4
  ) ON CONFLICT (id) DO NOTHING;

END;
$$;
