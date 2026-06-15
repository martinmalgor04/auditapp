-- auditapp schema v13 — #21 import_clientes
-- Índice único parcial sobre client.cuit para soportar el upsert ON CONFLICT del import en vivo.
--
-- Paso 0 (R18): repuntar FKs hacia los ids a borrar antes del merge, para no dejar referencias
--   colgadas. FKs hacia client.id: audit.client_id (NOT NULL) y crm_lead.client_id (nullable).
-- Paso 1 (R17/R18): consolidar CUIT duplicados conservando la fila de id MENOR por CUIT.
-- Paso 2: crear el índice único parcial (solo filas con cuit; los NULL no chocan).
--
-- El runner de migraciones (src/lib/server/db/migrate.ts) envuelve cada archivo en sql.begin,
-- por lo que los tres pasos corren atómicos en una transacción.

-- Mapa cuit -> id conservado (menor por cuit, entre los duplicados).
-- min() no opera sobre uuid; ordenamos por id::text (determinístico) y tomamos el menor.
CREATE TEMP TABLE client_cuit_keep ON COMMIT DROP AS
SELECT cuit, min(id::text)::uuid AS keep_id
FROM client
WHERE cuit IS NOT NULL
GROUP BY cuit
HAVING count(*) > 1;

-- Paso 0a: repuntar audit.client_id de las filas a borrar al id conservado.
UPDATE audit a
SET client_id = k.keep_id
FROM client c
JOIN client_cuit_keep k ON k.cuit = c.cuit
WHERE a.client_id = c.id
  AND c.id <> k.keep_id;

-- Paso 0b: repuntar crm_lead.client_id de las filas a borrar al id conservado.
UPDATE crm_lead l
SET client_id = k.keep_id
FROM client c
JOIN client_cuit_keep k ON k.cuit = c.cuit
WHERE l.client_id = c.id
  AND c.id <> k.keep_id;

-- Paso 1: borrar los duplicados (todos menos el id conservado por cuit).
DELETE FROM client c
USING client_cuit_keep k
WHERE c.cuit = k.cuit
  AND c.id <> k.keep_id;

-- Paso 2: índice único parcial. Solo clientes con cuit; los NULL quedan fuera (R9.bis).
CREATE UNIQUE INDEX IF NOT EXISTS client_cuit_unique
  ON client (cuit)
  WHERE cuit IS NOT NULL;
