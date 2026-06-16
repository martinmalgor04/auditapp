-- auditapp schema v17 — #23 crm_empresa_unificada (Fase 6: deprecación documentada SIN drop)
--
-- Decisión humana (2026-06-16, decisión 8): `crm_lead`, `crm_lead_event` y la vista de
-- compatibilidad `client` se MANTIENEN como red de rollback/backup. NO se dropean en #23.
-- La limpieza física es una tarea manual futura, FUERA del alcance de esta feature.
--
-- Esta migración SOLO documenta esos objetos como LEGACY / solo lectura vía `COMMENT ON`.
-- CERO `DROP`. CERO `REVOKE`. Es 100% aditiva sobre el catálogo (comentarios) y no toca datos
-- ni privilegios. Idempotente por construcción: `COMMENT ON` reescribe el comentario en cada
-- corrida (sin error, sin duplicar nada).
--
-- El runner (src/lib/server/db/migrate.ts) envuelve el archivo en sql.begin → atómico.
--
-- POR QUÉ SOLO COMMENT (sin REVOKE):
--   El rol de conexión de la app (`auditapp`) es DUEÑO de las tablas/vista (verificado en
--   pg_class.relowner). En Postgres el dueño de un objeto SIEMPRE conserva acceso pleno,
--   independientemente de los GRANT/REVOKE (los owners no se ven afectados por los privilegios
--   de tabla, salvo RLS). Por lo tanto un `REVOKE INSERT/UPDATE/DELETE` desde `auditapp` sería
--   un no-op para el propio `auditapp` y NO impediría escrituras: sería "deprecación de fachada",
--   engañosa, sin valor real de protección. Tampoco existe un rol de solo-lectura separado al cual
--   revocar. Además, la vista `client` SIGUE recibiendo INSERT/UPDATE del seed dev y de cualquier
--   lector/escritor legacy aún no reconectado; revocar escritura ahí podría romperlos.
--   Conclusión: marcar la intención con COMMENT es lo correcto y seguro. La prohibición real de
--   escritura se aplica por convención de equipo + la documentación de limpieza manual
--   (specs/23_crm_empresa_unificada/cleanup-manual.md), no por privilegios sobre el owner.

-- ── crm_lead: tabla legacy del CRM de leads, foldeada en `empresa` por la migración 015.
COMMENT ON TABLE crm_lead IS
  'DEPRECADO #23 (2026-06-16): foldeada en `empresa` por migr. 015. Conservar como red de '
  'rollback/backup. SOLO LECTURA: no escribir. Limpieza física = tarea manual futura, fuera de '
  'alcance de #23 (ver specs/23_crm_empresa_unificada/cleanup-manual.md). NO dropear sin esa guía.';

-- ── crm_lead_event: historial de cambios de estado de leads, migrado a `empresa_evento` (015).
COMMENT ON TABLE crm_lead_event IS
  'DEPRECADO #23 (2026-06-16): historial migrado a `empresa_evento` por migr. 015. Conservar como '
  'red de rollback/backup. SOLO LECTURA: no escribir. Limpieza física = tarea manual futura, fuera '
  'de alcance de #23 (ver specs/23_crm_empresa_unificada/cleanup-manual.md). NO dropear sin esa guía.';

-- ── client: vista de compatibilidad creada por la migración 015 (SELECT * FROM empresa).
--   Ya no debería tener lectores/escritores nuevos: todo el código de #23 quedó reconectado a
--   `empresa` (Fases 2–5). Se conserva como red de rollback/backup de los lectores legacy.
COMMENT ON VIEW client IS
  'DEPRECADO #23 (2026-06-16): vista de compatibilidad sobre `empresa` (migr. 015). El código '
  'reconectado de #23 lee/escribe `empresa` directo. Conservar como red de rollback/backup para '
  'lectores legacy aún no migrados. SOLO LECTURA recomendada. Eliminación física = tarea manual '
  'futura, fuera de alcance de #23 (ver specs/23_crm_empresa_unificada/cleanup-manual.md).';
