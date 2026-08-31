-- =====================================================================
-- 032_escaneo_revision_vinculo.sql — #62
-- Vinculación dispositivo escaneado ↔ fila del relevamiento manual.
-- La fila vive en audit_response.value.rows[*] (jsonb): no se puede FK al
-- row_id; la existencia se valida en aplicación y se resuelve en lectura.
-- =====================================================================

ALTER TABLE escaneo_dispositivo
  ADD COLUMN IF NOT EXISTS relevamiento_item_id uuid
    REFERENCES template_item(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relevamiento_row_id text;

-- Paridad: ambas columnas o ninguna (invariante local de fila, estilo #59)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'escaneo_dispositivo_vinculo_ck'
  ) THEN
    ALTER TABLE escaneo_dispositivo
      ADD CONSTRAINT escaneo_dispositivo_vinculo_ck CHECK (
        (relevamiento_item_id IS NULL) = (relevamiento_row_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS escaneo_dispositivo_vinculo_idx
  ON escaneo_dispositivo (relevamiento_item_id)
  WHERE relevamiento_item_id IS NOT NULL;
