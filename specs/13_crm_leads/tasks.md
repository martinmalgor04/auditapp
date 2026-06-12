# Tasks — #13 13_crm_leads

- [ ] T1 — Crear `migrations/006_crm_leads.sql`: tablas `crm_lead` y `crm_lead_event`, índice único `lower(email)`, índice por status. Cubre: R1, R8, R9.
- [ ] T2 — Añadir `tests/crm-schema.test.ts`: columnas, CHECKs de source/status, unicidad case-insensitive de email. Cubre: R1.
- [ ] T3 — Crear `src/lib/server/crm/state-machine.ts` (`canTransition`, `assertTransition`, `pathTo`) y `errors.ts` (`CrmInvalidTransitionError`, `CrmLeadNotFoundError`). Cubre: R2.
- [ ] T4 — Añadir `tests/crm-state-machine.test.ts`: tabla completa de transiciones válidas/ inválidas, `pathTo`, que transición inválida no inserta evento. Cubre: R2, R3, R8.
- [ ] T5 — Crear `src/lib/server/crm/schemas.ts`: `crmLeadBatchSchema` (1–200, email lowercased), `crmLeadCreateSchema`, `crmLeadUpdateSchema` (sin email/source), `crmStatusChangeSchema`. Cubre: R5, R13.
- [ ] T6 — Crear `src/lib/server/db/crm-leads.ts`: `listLeads`, `funnelCounts`, `getLeadById`, `createLead`, `upsertLeadsBatch` (transacción, ON CONFLICT, COALESCE, sin pisar status/source), `changeStatus` (transacción + evento + descartado_at), `updateLead`, `linkAudit` (avanza vía `pathTo`), `listLeadEvents`. Cubre: R3, R6, R8, R9, R11.
- [ ] T7 — Crear `src/lib/server/api/require-crm-token.ts` con comparación constant-time y validar `CRM_API_TOKEN` en el chequeo de env al arranque; documentar la var en `.env.example`. Cubre: R4.
- [ ] T8 — Crear `src/routes/api/crm/leads/batch/+server.ts` (POST token + Zod + upsert lote, respuesta `{ inserted, updated }`). Cubre: R4, R5, R6.
- [ ] T9 — Añadir `tests/api/crm-leads-batch.test.ts`: 401 sin/mal token y con env sin token, 400 por Zod (lote atómico, máx 200), dedupe/upsert sin pisar status, conteos de respuesta. Cubre: R4, R5, R6.
- [ ] T10 — Crear `src/routes/api/crm/leads/+server.ts` (GET staff con filtros status/source y búsqueda `q`; POST admin alta manual) y `src/routes/api/crm/leads/[id]/+server.ts` (PATCH admin: edición, `client_id` con 404 si no existe, `audit_id` con avance a auditado y 409 sobre descartado). Sin DELETE. Cubre: R3, R7, R9, R10, R13, R14.
- [ ] T11 — Crear `src/routes/api/crm/leads/[id]/status/+server.ts` (POST staff, valida máquina de estados, 409 en inválida, registra evento con `changed_by`). Cubre: R8, R12.
- [ ] T12 — Añadir `tests/api/crm-leads.test.ts`: guards 401/403 por rol y acción, filtros y búsqueda, contadores del funnel, cambio de estado válido/409, evento con quién/cuándo, descartado excluido del listado default con historial vivo, PATCH de notas/próxima acción, email/source inmutables 400, client_id 404, conteo de `client` intacto. Cubre: R7, R8, R9, R10, R11, R12, R13, R14.
- [ ] T13 — Crear `src/routes/(app)/crm/+page.server.ts`, `+page.svelte` y `lead-row.svelte`: chips de contadores, filtros, búsqueda, tabla con fila expandible (notas, próxima acción, historial), select de transiciones válidas, acciones admin; agregar entrada "CRM" a la navegación del layout `(app)`. Cubre: R10, R11, R12.
- [ ] T14 — Añadir `e2e/crm.spec.ts`: login staff, lista renderiza con contadores, filtro reduce filas, avanzar un lead de estado se refleja en UI. Cubre: R10, R12.
- [ ] T15 — Crear `progress/impl_13_crm_leads.md` con el mapa test ↔ R<n> y correr gate (`pnpm run check`, `pnpm test`, `pnpm exec playwright test`, `./init.sh`). Cubre: trazabilidad de R1–R14.
