-- #50 recuperar_contrasena: tabla de tokens de reseteo de contraseña
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS

CREATE TABLE IF NOT EXISTS password_reset_token (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_token_hash_uq
  ON password_reset_token (token_hash);

CREATE INDEX IF NOT EXISTS password_reset_token_user_idx
  ON password_reset_token (user_id);

CREATE INDEX IF NOT EXISTS password_reset_token_expires_idx
  ON password_reset_token (expires_at);
