-- =====================================================================
-- 030_escaneo_modelo_datos.sql — #59
-- Modelo de datos para escaneo automatizado de red (agente externo #61).
-- =====================================================================

CREATE TABLE IF NOT EXISTS escaneo (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id              uuid NOT NULL REFERENCES audit(id) ON DELETE CASCADE,
  tecnico_id            uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,

  etiqueta              text,              -- "VLAN administración", "Depósito"
  rango_objetivo        text NOT NULL,     -- "192.168.1.0/24"
  estado                text NOT NULL DEFAULT 'pendiente' CHECK (estado IN (
                          'pendiente', 'en_curso', 'sincronizando',
                          'completado', 'fallido', 'cancelado'
                        )),

  agente_version        text NOT NULL,
  agente_hostname       text,

  -- Consentimiento condicionado por estado (decisión puerta 2026-08-27)
  consentimiento_otorgado  boolean NOT NULL DEFAULT false,
  consentimiento_por       text,
  consentimiento_at        timestamptz,

  dispositivos_detectados  integer NOT NULL DEFAULT 0,
  error_detalle            text,

  iniciado_at           timestamptz,
  finalizado_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT escaneo_consentimiento_ck CHECK (
    estado IN ('pendiente', 'cancelado')
    OR (consentimiento_otorgado
        AND consentimiento_por IS NOT NULL
        AND consentimiento_at IS NOT NULL)
  ),
  CONSTRAINT escaneo_fechas_ck CHECK (
    finalizado_at IS NULL OR iniciado_at IS NULL OR finalizado_at >= iniciado_at
  ),
  CONSTRAINT escaneo_error_ck CHECK (
    estado <> 'fallido' OR error_detalle IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS escaneo_audit_idx ON escaneo (audit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS escaneo_estado_idx ON escaneo (estado)
  WHERE estado IN ('en_curso', 'sincronizando');

CREATE TABLE IF NOT EXISTS escaneo_dispositivo (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escaneo_id        uuid NOT NULL REFERENCES escaneo(id) ON DELETE CASCADE,

  -- Identidad determinística (R12): mac normalizada, o ip si no hay mac
  identidad         text NOT NULL,
  mac               text,
  ip                inet NOT NULL,

  hostname          text,
  fqdn              text,
  fabricante        text,
  modelo            text,
  serial            text,
  tipo              text NOT NULL DEFAULT 'desconocido' CHECK (tipo IN (
                      'servidor', 'workstation', 'notebook', 'switch',
                      'router', 'firewall', 'impresora', 'camara', 'nas',
                      'ups', 'telefonia', 'movil', 'virtual', 'desconocido'
                    )),

  so_familia        text,
  so_nombre         text,
  so_version        text,
  so_arquitectura   text,

  cpu_descripcion   text,
  memoria_mb        integer,
  disco_total_gb    integer,

  visto_at          timestamptz,
  fuente            text NOT NULL DEFAULT 'open-audit',
  raw               jsonb NOT NULL DEFAULT '{}'::jsonb,

  revision          text NOT NULL DEFAULT 'sin_revisar' CHECK (revision IN (
                      'sin_revisar', 'confirmado', 'descartado', 'fusionado'
                    )),
  revisado_por      uuid REFERENCES app_user(id) ON DELETE SET NULL,
  revisado_at       timestamptz,
  nota_tecnico      text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT escaneo_dispositivo_identidad_uq UNIQUE (escaneo_id, identidad),
  CONSTRAINT escaneo_dispositivo_mac_ck CHECK (
    mac IS NULL OR mac ~ '^[0-9a-f]{12}$'
  ),
  CONSTRAINT escaneo_dispositivo_memoria_ck CHECK (
    memoria_mb IS NULL OR memoria_mb > 0
  ),
  CONSTRAINT escaneo_dispositivo_revision_ck CHECK (
    revision = 'sin_revisar'
    OR (revisado_por IS NOT NULL AND revisado_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS escaneo_dispositivo_escaneo_idx
  ON escaneo_dispositivo (escaneo_id);
CREATE INDEX IF NOT EXISTS escaneo_dispositivo_mac_idx
  ON escaneo_dispositivo (mac) WHERE mac IS NOT NULL;
CREATE INDEX IF NOT EXISTS escaneo_dispositivo_tipo_idx
  ON escaneo_dispositivo (escaneo_id, tipo);
CREATE INDEX IF NOT EXISTS escaneo_dispositivo_revision_idx
  ON escaneo_dispositivo (escaneo_id, revision);
CREATE INDEX IF NOT EXISTS escaneo_dispositivo_raw_gin
  ON escaneo_dispositivo USING gin (raw);

CREATE TABLE IF NOT EXISTS escaneo_software (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispositivo_id  uuid NOT NULL REFERENCES escaneo_dispositivo(id) ON DELETE CASCADE,

  nombre          text NOT NULL,
  version         text,
  publisher       text,
  instalado_at    date,
  raw             jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT escaneo_software_uq UNIQUE (dispositivo_id, nombre, version)
);

CREATE INDEX IF NOT EXISTS escaneo_software_dispositivo_idx
  ON escaneo_software (dispositivo_id);
CREATE INDEX IF NOT EXISTS escaneo_software_nombre_idx
  ON escaneo_software (lower(nombre));

CREATE TABLE IF NOT EXISTS escaneo_servicio (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispositivo_id  uuid NOT NULL REFERENCES escaneo_dispositivo(id) ON DELETE CASCADE,

  puerto          integer NOT NULL,
  protocolo       text NOT NULL DEFAULT 'tcp'
                  CHECK (protocolo IN ('tcp', 'udp', 'sctp')),
  estado_puerto   text NOT NULL DEFAULT 'open',
  servicio        text,
  producto        text,
  version         text,
  banner          text,
  raw             jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT escaneo_servicio_uq UNIQUE (dispositivo_id, puerto, protocolo),
  CONSTRAINT escaneo_servicio_puerto_ck CHECK (puerto BETWEEN 1 AND 65535)
);

CREATE INDEX IF NOT EXISTS escaneo_servicio_dispositivo_idx
  ON escaneo_servicio (dispositivo_id);
CREATE INDEX IF NOT EXISTS escaneo_servicio_puerto_idx
  ON escaneo_servicio (puerto, protocolo);
