-- =====================================================================
-- 031_escaneo_token.sql — #60
-- Tokens opacos por escaneo para el agente externo (#61).
-- =====================================================================

CREATE TABLE IF NOT EXISTS escaneo_token (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escaneo_id   uuid NOT NULL REFERENCES escaneo(id) ON DELETE CASCADE,
  token_hash   text NOT NULL,        -- SHA-256 hex del token en claro
  creado_por   uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT escaneo_token_hash_ck CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT escaneo_token_ttl_ck CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS escaneo_token_hash_uq
  ON escaneo_token (token_hash);

-- Un solo token activo por escaneo (rotación = revocar + insertar, R3)
CREATE UNIQUE INDEX IF NOT EXISTS escaneo_token_activo_uq
  ON escaneo_token (escaneo_id) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS escaneo_token_escaneo_idx
  ON escaneo_token (escaneo_id);
