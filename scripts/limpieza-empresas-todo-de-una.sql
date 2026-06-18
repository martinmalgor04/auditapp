-- ============================================================================
-- limpieza-empresas-todo-de-una.sql
-- Pegar y ejecutar TODO de una vez. Hace: backup -> conteos -> borrado real.
--
-- Borra personas físicas (CUIT 20/23/24/27, 11 dígitos) que NO tengan
-- auditorías ni leads. Conserva empresas (30/33/34), sin_cuit y prefijos raros.
-- Si algo sale mal, abajo está el RESTORE desde el backup.
-- ============================================================================

BEGIN;

-- 1) Backup completo (red de seguridad)
CREATE TABLE empresa_backup_20260616 AS SELECT * FROM empresa;

-- 2) Conteos de control (los vas a ver en la salida)
SELECT count(*) AS total_antes FROM empresa;

SELECT
  CASE
    WHEN cuit IS NULL OR btrim(cuit) = ''                        THEN 'sin_cuit'
    WHEN regexp_replace(cuit, '\D', '', 'g') ~ '^(30|33|34)'    THEN 'empresa (30/33/34)'
    WHEN regexp_replace(cuit, '\D', '', 'g') ~ '^(20|23|24|27)' THEN 'persona_fisica (20/23/24/27)'
    ELSE 'otro_prefijo'
  END        AS clase,
  count(*)   AS cantidad
FROM empresa
GROUP BY 1
ORDER BY 2 DESC;

-- 3) Borrado real (los eventos asociados se borran solos por cascade)
DELETE FROM empresa e
WHERE regexp_replace(coalesce(e.cuit, ''), '\D', '', 'g') ~ '^(20|23|24|27)'
  AND length(regexp_replace(coalesce(e.cuit, ''), '\D', '', 'g')) = 11
  AND NOT EXISTS (SELECT 1 FROM audit a    WHERE a.empresa_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM crm_lead l WHERE l.client_id  = e.id);

-- 4) Conteo final
SELECT count(*) AS total_despues FROM empresa;

COMMIT;

-- ============================================================================
-- RESTORE (si te arrepentís): reinserta lo borrado desde el backup
--   INSERT INTO empresa
--   SELECT * FROM empresa_backup_20260616 b
--   WHERE NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = b.id);
--
-- Borrar el backup cuando estés tranquilo:
--   DROP TABLE empresa_backup_20260616;
-- ============================================================================
