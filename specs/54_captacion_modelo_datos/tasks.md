# Tasks — #54 54_captacion_modelo_datos

> Orden de implementación. Cada paso referencia los `R<n>` que cubre. No marcar `done` sin
> `pnpm run check`, `pnpm run build` y `pnpm test` en verde (sin SMTP/servicios externos). DDL solo
> en auditapp; la `captacion-app` no entra en esta feature.

- [ ] T1 — Crear migración `migrations/0NN_captacion_modelo_datos.sql` (`0NN` = siguiente tras 028):
  `captacion_prospecto_meta`, `content_asset`, `campaign`, `sequence_step`, `message`, `email_event`,
  `suppression_list` con `CREATE TABLE IF NOT EXISTS`, índices `IF NOT EXISTS`, CHECKs y FKs a
  `empresa`/`app_user` según design §Schema. Idempotente. Cubre: R1–R8.
- [ ] T2 — En la misma migración: `ALTER TABLE empresa_evento` drop+add del CHECK de `tipo` sumando
  `'email'` (idempotente). Cubre: R9.
- [ ] T3 — En la misma migración: `CREATE OR REPLACE VIEW captacion_prospecto` (join `empresa` +
  `captacion_prospecto_meta`, `relacion='prospecto'`, email no nulo, excluye `suppression_list`).
  Cubre: R11.
- [ ] T4 — `tests/captacion-schema.test.ts`: aplicar la migración dos veces sin error; existencia de
  las 7 tablas con columnas/CHECK/FK/unique; `empresa_evento` acepta `tipo='email'`; la vista
  `captacion_prospecto` filtra un email suprimido; `crm_lead`/`crm_lead_event`/vista `client`
  intactas. Cubre: R1–R9, R11, R12.
- [ ] T5 — Actualizar la derivación de estado (#23) para contar `'email'` como contacto:
  - `src/lib/server/crm/empresa-estado.ts`: comentario de `EstadoInputs.hasContactEvent` →
    "llamada/reunion/nota/email".
  - `src/lib/server/db/empresa.ts`: en `estadoSelectSql`/CTE, sumar `'email'` al `tipo IN (...)` que
    computa `hasContactEvent`. Cubre: R10.
- [ ] T6 — Extender `tests/empresa-estado.test.ts`: una `empresa` `prospecto` con un solo
  `empresa_evento` `tipo='email'` deriva `contactada`; el test de paridad SQL↔TS pasa con el nuevo
  tipo incluido. Cubre: R10.
- [ ] T7 — Crear `src/lib/server/db/captacion.ts`: `listMessagesByEmpresa(empresaId)` + tipos
  `MessageRow`/`MessageEstado` (solo lectura; auditapp no escribe captación). Cubre: R13.
- [ ] T8 — `tests/captacion-db.test.ts`: `listMessagesByEmpresa` devuelve los mensajes de una empresa
  ordenados por fecha; la timeline de empresa (#23) incluye los `empresa_evento` `tipo='email'`.
  Cubre: R13.
- [ ] T9 — (Si aplica) mostrar la actividad de captación en la ficha de empresa del cockpit (#23)
  reusando `listMessagesByEmpresa` y la timeline existente. Sin endpoints nuevos de captación.
  Cubre: R13.
- [ ] T10 — Registrar la feature en `feature_list.json` (id 54, `sdd: true`, status `spec_ready`) y
  en `specs/README.md` / `specs/SOURCE_MAP.md`. Mapa de trazabilidad `R<n>` ↔ test en
  `progress/impl_54_captacion_modelo_datos.md`. Cubre: trazabilidad.
- [ ] T11 — `pnpm run check`, `pnpm run build`, `pnpm test` verdes; suite de #23 (empresa, derivación,
  paridad) sigue pasando; `crm_lead`/`client` sin cambios. Cubre: R12.

## Notas de implementación

- **Número de migración**: confirmar el siguiente libre tras `028_notificaciones_push_pwa.sql` antes
  de crear el archivo (sería `029_` salvo que haya otra en vuelo).
- **Paridad SQL↔TS (R10)**: es el punto más delicado. Editar `empresa-estado.ts` y el `CASE`/CTE de
  `empresa.ts` en el mismo commit; el test de paridad de #23 es el guardrail.
- **No tocar `crm_lead`**: cualquier escritura de prospectos hacia `empresa` la hace la
  `captacion-app` (su propia feature). #54 solo deja el destino (`empresa` + `captacion_prospecto_meta`)
  y la vista de lectura listos.
