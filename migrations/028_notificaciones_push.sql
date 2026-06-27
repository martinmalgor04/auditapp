-- #53 Notificaciones push PWA
-- Idempotente: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS

CREATE TABLE IF NOT EXISTS push_subscription (
  id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  endpoint   text        NOT NULL,
  p256dh     text        NOT NULL,
  auth       text        NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscription_endpoint_uidx
  ON push_subscription (endpoint);

CREATE INDEX IF NOT EXISTS push_subscription_user_idx
  ON push_subscription (user_id);

-- Preferencia opt-in/opt-out de push por usuario (R10), independiente del email (#49).
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS notify_push boolean NOT NULL DEFAULT true;
