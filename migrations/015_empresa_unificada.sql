-- auditapp schema v15 — #23 crm_empresa_unificada (Fase 1)
--
-- Fusiona `client` + `crm_lead` en una entidad única `empresa` (registro de empresas:
-- clientes + ex-clientes + prospectos), preservando cada uuid y por tanto cada FK de `audit`.
-- Estrategia A (rename + fold), decidida en puerta humana (2026-06-16). NO crea tabla nueva.
--
-- El runner (src/lib/server/db/migrate.ts) envuelve el archivo en sql.begin → todo atómico.
-- Idempotente: guards IF [NOT] EXISTS / WHERE NOT EXISTS; re-correr es no-op seguro.
--
-- Decisiones FIJAS respetadas:
--   · Carga histórica determinística por origen (R32): presupuestos/tango → 'cliente',
--     prospecto → 'prospecto'. Distinto del import en vivo (selector, fuera de Fase 1).
--   · Dedup de prospectos sin CUIT por razón social normalizada (R9): match → fusiona,
--     sin match → fila separada (nunca se descarta).
--   · `ex_cliente` solo manual: la migración NO marca ninguno automáticamente.
--   · NO se dropea `crm_lead`/`crm_lead_event` ni la vista `client` (red de rollback/backup).
--
-- DESVIACIÓN justificada vs. el SQL conceptual del design:
--   `relacion` se crea NOT NULL CON DEFAULT 'prospecto' (el design lo dejaba solo NOT NULL).
--   Motivo: en Fase 1 los escritores legacy (seed, import #21, createAudit, bundle import)
--   siguen haciendo INSERT a través de la vista `client` y NO informan `relacion`. Un INSERT
--   por una vista auto-actualizable usa el DEFAULT de la tabla base para las columnas omitidas;
--   sin default fallaría por NOT NULL y rompería a esos escritores, violando el objetivo de
--   Fase 1 ("nada se rompe, la vista client sigue sirviendo a los lectores/escritores viejos").
--   Las Fases 2/3 reconectan esos escritores a `empresa` y setean `relacion` explícita.

-- ── Paso 1: renombrar client → empresa (preserva uuid y FKs audit.client_id, crm_lead.client_id).
--   Guard idempotente: solo si `client` es todavía una TABLA BASE ('r') y `empresa` no existe.
--   Tras la 1ª corrida `client` pasa a ser VISTA ('v') sobre `empresa`; re-correr es no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'client' AND relkind = 'r')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'empresa' AND relkind = 'r') THEN
    ALTER TABLE client RENAME TO empresa;
  END IF;
END;
$$;
ALTER INDEX IF EXISTS client_cuit_unique RENAME TO empresa_cuit_unique;

-- ── Paso 2: columnas nuevas de la entidad unificada (idempotente).
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS relacion text;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS tiene_software text;   -- prospecto (crm_lead/csv)
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS fuente text;           -- prospecto (csv 'fuente')
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS estado_override text;
-- nivel_interes, observaciones, pagina, relevado_at YA existen (migr. 005).

-- ── Paso 3: backfill de relacion según origen (CARGA HISTÓRICA, R32) + NOT NULL/DEFAULT + CHECK.
UPDATE empresa SET relacion = CASE
  WHEN origen IN ('presupuestos', 'tango') THEN 'cliente'
  WHEN origen = 'prospecto'                THEN 'prospecto'
  ELSE 'prospecto'
END
WHERE relacion IS NULL;

ALTER TABLE empresa ALTER COLUMN relacion SET DEFAULT 'prospecto';
ALTER TABLE empresa ALTER COLUMN relacion SET NOT NULL;

ALTER TABLE empresa DROP CONSTRAINT IF EXISTS empresa_relacion_check;
ALTER TABLE empresa ADD CONSTRAINT empresa_relacion_check
  CHECK (relacion IN ('cliente', 'prospecto', 'ex_cliente'));

-- CHECK del estado_override contra el enum de estados derivados (#23 §3).
ALTER TABLE empresa DROP CONSTRAINT IF EXISTS empresa_estado_override_check;
ALTER TABLE empresa ADD CONSTRAINT empresa_estado_override_check
  CHECK (estado_override IS NULL OR estado_override IN (
    'sin_contactar', 'contactada', 'auditoria_en_curso',
    'auditada', 'presupuestada', 'activa', 'inactiva'
  ));

-- ── Paso 4: foldear crm_lead NO vinculado a un client (client_id IS NULL) que NO matchee
--   por razón social normalizada con una empresa existente. Dedup R9.
--   norm(s) = lower(regexp_replace(trim(s), '\s+', ' ', 'g')). Los prospectos no traen CUIT,
--   así que este INSERT no toca el índice único de CUIT.
INSERT INTO empresa (razon_social, telefono, email, referente_nombre, observaciones, fuente,
                     origen, relacion)
SELECT l.empresa, l.telefono, l.email, l.contacto, l.notas, l.source,
       'prospecto', 'prospecto'
FROM crm_lead l
WHERE l.client_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM empresa e
    WHERE lower(regexp_replace(trim(e.razon_social), '\s+', ' ', 'g'))
        = lower(regexp_replace(trim(l.empresa), '\s+', ' ', 'g'))
  );

-- ── Paso 5: mapa lead → empresa (por client_id directo o por razón social normalizada) para
--   migrar el historial de eventos. ON COMMIT DROP: vive solo dentro de la transacción del runner.
CREATE TEMP TABLE lead_to_empresa ON COMMIT DROP AS
SELECT l.id AS lead_id,
       COALESCE(
         l.client_id,
         (SELECT e.id FROM empresa e
          WHERE lower(regexp_replace(trim(e.razon_social), '\s+', ' ', 'g'))
              = lower(regexp_replace(trim(l.empresa), '\s+', ' ', 'g'))
          ORDER BY e.id::text
          LIMIT 1)
       ) AS empresa_id
FROM crm_lead l;

-- ── Paso 6: renombrar la FK de audit (intacta: solo cambia el nombre de la columna) + índice.
--   crm_lead.audit_id ya apunta a audit.id; no necesita re-puntado (audit.empresa_id ya es correcto).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE audit RENAME COLUMN client_id TO empresa_id;
  END IF;
END;
$$;
ALTER INDEX IF EXISTS audit_client_id_idx RENAME TO audit_empresa_id_idx;

-- ── Paso 7: tabla de eventos unificada empresa_evento + migrar historial desde crm_lead_event.
CREATE TABLE IF NOT EXISTS empresa_evento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('llamada', 'reunion', 'nota', 'cambio_estado', 'sistema')),
  texto text,
  from_status text,
  to_status text,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS empresa_evento_empresa_id_idx ON empresa_evento (empresa_id);

-- Migrar historial. Idempotente: WHERE NOT EXISTS evita duplicar si la migración se re-corre
--   (match por empresa + timestamp + transición de estado, que identifica el evento migrado).
INSERT INTO empresa_evento (empresa_id, tipo, from_status, to_status, created_by, created_at)
SELECT m.empresa_id, 'cambio_estado', ev.from_status, ev.to_status, ev.changed_by, ev.created_at
FROM crm_lead_event ev
JOIN lead_to_empresa m ON m.lead_id = ev.lead_id
WHERE m.empresa_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM empresa_evento ee
    WHERE ee.empresa_id = m.empresa_id
      AND ee.tipo = 'cambio_estado'
      AND ee.created_at = ev.created_at
      AND ee.from_status IS NOT DISTINCT FROM ev.from_status
      AND ee.to_status IS NOT DISTINCT FROM ev.to_status
  );

-- ── Paso 8 (T2): índices de búsqueda/dedup sobre empresa.
CREATE INDEX IF NOT EXISTS empresa_relacion_idx ON empresa (relacion);
CREATE INDEX IF NOT EXISTS empresa_razon_social_lower_idx ON empresa (lower(razon_social));

-- ── Paso 9: compatibilidad hacia atrás (R30). Vista 'client' = empresa para los lectores/
--   escritores aún no reconectados (mercado, audits, seed, import). SELECT * preserva el orden
--   de columnas de la tabla base → la vista es auto-actualizable y hereda el DEFAULT de relacion.
CREATE OR REPLACE VIEW client AS SELECT * FROM empresa;

-- crm_lead / crm_lead_event / vista client NO se dropean (decisión humana 2026-06-16, #8):
-- se conservan como red de rollback/backup. La Fase 6 los marca legacy SIN drop.
