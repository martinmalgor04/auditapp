-- migrations/018_hora_inicio_fin.sql
-- Agrega started_at y finished_at a audit (R1).
-- Idempotente: no falla si las columnas ya existen.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit' AND column_name = 'started_at'
  ) THEN
    ALTER TABLE audit ADD COLUMN started_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit' AND column_name = 'finished_at'
  ) THEN
    ALTER TABLE audit ADD COLUMN finished_at timestamptz;
  END IF;
END $$;
