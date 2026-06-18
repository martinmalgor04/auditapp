-- ============================================================================
-- limpieza-empresas-personas-fisicas.sql
-- Objetivo: quitar del CRM los registros de Tango que NO son empresas
--           (personas físicas), conservando solo personas jurídicas.
--
-- Criterio acordado:
--   EMPRESA  = CUIT con prefijo 30 / 33 / 34  (persona jurídica)  -> SE CONSERVA
--   PERSONA  = CUIT con prefijo 20 / 23 / 24 / 27 (persona física) -> SE BORRA
--   sin_cuit / otro_prefijo                                        -> NO se tocan
--
-- Seguridad:
--   * Bloque 0 crea un backup completo de `empresa` antes de borrar nada.
--   * Bloque 1 es solo lectura: revisá los conteos antes de seguir.
--   * Bloque 2 hace el DELETE dentro de una transacción que termina en
--     ROLLBACK. Mirá el conteo borrado y, si estás conforme, cambiá
--     ROLLBACK por COMMIT y volvé a correr SOLO el bloque 2.
--
-- Ejecutar contra PRODUCCIÓN (Dokploy). Correr los bloques EN ORDEN.
-- ============================================================================


-- ============================================================================
-- BLOQUE 0 — BACKUP  (correr una sola vez)
-- ----------------------------------------------------------------------------
-- Copia completa de los datos de `empresa`. Restore: ver nota al final.
-- ============================================================================
CREATE TABLE empresa_backup_20260616 AS SELECT * FROM empresa;

SELECT count(*) AS filas_respaldadas FROM empresa_backup_20260616;


-- ============================================================================
-- BLOQUE 1 — ANÁLISIS  (solo lectura — revisar antes de borrar)
-- ============================================================================

-- 1.a  Total y cuántos vienen de Tango
SELECT
  count(*)                                  AS total_empresas,
  count(*) FILTER (WHERE origen = 'tango')  AS desde_tango
FROM empresa;

-- 1.b  Clasificación por prefijo de CUIT (normalizado: sin puntos ni guiones)
SELECT
  CASE
    WHEN cuit IS NULL OR btrim(cuit) = ''                              THEN 'sin_cuit'
    WHEN regexp_replace(cuit, '\D', '', 'g') ~ '^(30|33|34)'          THEN 'empresa (30/33/34)'
    WHEN regexp_replace(cuit, '\D', '', 'g') ~ '^(20|23|24|27)'       THEN 'persona_fisica (20/23/24/27)'
    ELSE 'otro_prefijo'
  END                                        AS clase,
  count(*)                                   AS cantidad
FROM empresa
GROUP BY 1
ORDER BY 2 DESC;

-- 1.c  Personas físicas que SE EXCLUIRÁN del borrado por tener
--      auditorías o leads asociados (revisión manual aparte)
SELECT count(*) AS personas_fisicas_con_dependencias
FROM empresa e
WHERE regexp_replace(coalesce(e.cuit, ''), '\D', '', 'g') ~ '^(20|23|24|27)'
  AND length(regexp_replace(coalesce(e.cuit, ''), '\D', '', 'g')) = 11
  AND (
        EXISTS (SELECT 1 FROM audit a     WHERE a.empresa_id = e.id)
     OR EXISTS (SELECT 1 FROM crm_lead l  WHERE l.client_id = e.id)
      );

-- 1.d  Cuántas se borrarían realmente (personas físicas SIN dependencias)
SELECT count(*) AS se_borraran
FROM empresa e
WHERE regexp_replace(coalesce(e.cuit, ''), '\D', '', 'g') ~ '^(20|23|24|27)'
  AND length(regexp_replace(coalesce(e.cuit, ''), '\D', '', 'g')) = 11
  AND NOT EXISTS (SELECT 1 FROM audit a    WHERE a.empresa_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM crm_lead l WHERE l.client_id = e.id);

-- 1.e  Muestra de 30 registros que se borrarían (control visual)
SELECT id, cuit, razon_social, origen, relacion
FROM empresa e
WHERE regexp_replace(coalesce(e.cuit, ''), '\D', '', 'g') ~ '^(20|23|24|27)'
  AND length(regexp_replace(coalesce(e.cuit, ''), '\D', '', 'g')) = 11
  AND NOT EXISTS (SELECT 1 FROM audit a    WHERE a.empresa_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM crm_lead l WHERE l.client_id = e.id)
ORDER BY razon_social
LIMIT 30;


-- ============================================================================
-- BLOQUE 2 — BORRADO  (transacción de prueba: termina en ROLLBACK)
-- ----------------------------------------------------------------------------
-- Los eventos (empresa_evento) se borran solos por ON DELETE CASCADE.
-- Corré este bloque tal cual: verás cuántas filas borraría SIN aplicar.
-- Si el número coincide con 1.d y estás conforme:
--    -> cambiá la última línea ROLLBACK por COMMIT y volvé a correr el bloque.
-- ============================================================================
BEGIN;

DELETE FROM empresa e
WHERE regexp_replace(coalesce(e.cuit, ''), '\D', '', 'g') ~ '^(20|23|24|27)'
  AND length(regexp_replace(coalesce(e.cuit, ''), '\D', '', 'g')) = 11
  AND NOT EXISTS (SELECT 1 FROM audit a    WHERE a.empresa_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM crm_lead l WHERE l.client_id = e.id);

-- Verificación post-borrado (dentro de la transacción)
SELECT count(*) AS empresas_restantes FROM empresa;

ROLLBACK;   -- <<< cambiar por COMMIT cuando el conteo sea el esperado


-- ============================================================================
-- RESTORE (si algo salió mal y ya hiciste COMMIT)
-- ----------------------------------------------------------------------------
-- Reinserta las filas borradas que estaban en el backup:
--
--   INSERT INTO empresa
--   SELECT * FROM empresa_backup_20260616 b
--   WHERE NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = b.id);
--
-- Cuando termines y estés seguro, podés eliminar el backup:
--   DROP TABLE empresa_backup_20260616;
-- ============================================================================
