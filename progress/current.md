# Sesión actual

## Feature en curso: #20 20_export_import_auditorias

**Estado:** implementación COMPLETA — pendiente reviewer (sigue `in_progress`).

### Entregables
- Dominio `src/lib/server/bundle/`: version, schema (Zod), errors, item-key, build, resolve, import.
- DB `src/lib/server/db/audit-bundle.ts`: lecturas del build + resolvers destino por clave natural.
- API: `GET /api/audits/[id]/bundle/export` y `POST /api/audits/bundle/import` (default dry-run).
- UI: `<AuditBundleActions>` (solo admin) en la vista de auditoría — export + import con dry-run.
- Migración `011_audit_bundle_import.sql` (dedupe).
- Env `INSTANCE_ID` (opcional, fallback 'unknown') en `env.ts` y `.env.example`.

### Decisiones humanas respetadas
- OQ-1: clave ítem 4 campos; drift (sort_order igual, field_type distinto) ⇒ faltante.
- OQ-2: endpoint default dry-run; escritura exige strict|permissive explícito.
- OQ-3: public_token regenerado solo si status ∈ {briefing_enviado, briefing_completo}; NULL resto.

### Tasks
- T1..T23 todas `[x]` en `specs/20_export_import_auditorias/tasks.md`.

### Verificación (gate)
- `./init.sh` → exit 0 (136 archivos, 612 passed, 2 skipped). `[OK] Entorno listo`.
- `pnpm test` → verde. 40 tests nuevos de #20 verdes.
- `pnpm exec playwright test e2e/audit-bundle.spec.ts` → 2 passed.
- `pnpm run check` / `tsc --noEmit`: SIN errores nuevos en archivos de #20. Errores reportados son
  PRE-EXISTENTES y ajenos (`tests/setup.ts`, `tests/api/attachments-delete.test.ts`,
  `tests/form-save-indicator.test.ts`, `src/lib/server/db/audit-responses.ts`). El gate del arnés
  (`init.sh`) corre `pnpm test`, no `tsc`.

### Trazabilidad
- `progress/impl_20_export_import_auditorias.md` (R1..R18 ↔ tests).

### Notas para el reviewer
- `tests/migrate.test.ts` actualizado con la nueva migración `011`.
- `tests/helpers/db.ts` agrega `audit_bundle_import` a los TRUNCATE.
- No marcar `done` sin re-validar el gate; la feature queda `in_progress` a propósito.
