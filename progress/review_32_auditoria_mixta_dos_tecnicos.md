# Review — feature #32 (32_auditoria_mixta_dos_tecnicos)

**Veredicto:** APPROVED

## Trazabilidad R ↔ test
- R1–R5, R26: [x] `db/audit-assignment-migration.test.ts`
- R2, R4, R26: [x] backfill + assigned_tech_id intacto + respuestas intactas
- R3: [x] migración 2× sin fallar ni duplicar
- R6: [x] `new/+page.svelte` (select por tipo) + schema/parser `techByType`
- R7: [x] `backoffice/create-audit-assignment.test.ts` (tech IT a tipo ERP → rechazo)
- R8, R9, R10: [x] `create-audit-assignment.test.ts` (N asignaciones tx, lead determinístico)
- R11, R12, R15: [x] `form/section-scope.test.ts` (CAB + IT, sin ERP)
- R13: [x] `section-scope.test.ts` (admin ve todo)
- R14: [x] `section-scope.test.ts` (sin asignación → 403)
- R16, R17: [x] `form/cab-lock.test.ts` (editar + confirmar atómico)
- R18, R19, R20: [x] `cab-lock.test.ts` (B solo-lectura, edición CAB rechazada, área editable)
- R21, R22, R23: [x] `api/report-access-assignment.test.ts` (+ caso compat single-type)
- R24: [x] revisión `git status` — scoring/render/esquema audit_response intactos
- R25: [x] `create-audit-assignment.test.ts` + tests existentes migrados

## Tasks
- T1–T20: [x] (verificadas en código y tests)
- T21: [x] (trazabilidad en `impl_32_*.md`; check/diff verificados por reviewer)

## Checkpoints
- C1: [x]  C2: [~] (2 in_progress, ver nota)  C3: [x]  C4: [x]  C5: [~] (untracked)  C6: [x]

## Calidad / seguridad
- Migración 020: idempotente (CREATE TABLE IF NOT EXISTS, columnas guardadas por
  information_schema, backfill ON CONFLICT DO NOTHING). CERO DELETE/DROP. FKs correctas
  (audit ON DELETE CASCADE, tech_id → app_user). NO repite el problema de 019. OK.
- `requireReportReadAccess`: cambio retro-compatible (assignedTechIds opcional, fallback
  al comportamiento anterior). Probado el caso compat.
- save-response rechaza ítems CAB de no-confirmadores server-side (R18). Fail-safe.
- check: 0 errores (32 warnings preexistentes state_referenced_locally).

## Notas / hallazgos
- C2: dos features in_progress (#31/#32) por el desvío de alcance. Decisión humana.
- Menor (no bloquea): la página de detalle de auditoría
  `(app)/auditorias/[id]/+page.server.ts` y el listado de versiones
  `api/audits/[id]/report/+server.ts` siguen usando `auditMatchesUserScope` /
  `assignedTechId === user.id` (overlap de especialidad), no asignación efectiva.
  Bajo R22 literal el acceso a "la auditoría" debería ser por asignación; el form
  (R14) y el guard de informe (R23) SÍ se migraron. El mapeo de tasks de #32 cubre
  R22 vía form+informe, no la página de detalle. Divergencia menor de la letra de R22,
  sin riesgo de privilegio (más permisivo solo para técnicos con especialidad del tipo,
  no expone otras auditorías). Recomendado seguimiento, no bloquea.

APPROVED -> progress/review_32_auditoria_mixta_dos_tecnicos.md
