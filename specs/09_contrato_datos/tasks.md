# Tasks — #9 09_contrato_datos

Implementación en orden. Marcar `[x]` al completar. Documentar trazabilidad R→test en `progress/impl_09_contrato_datos.md`.

**Prerequisito:** `08_cierre_scoring` (#8) en `done` (motor scoring, `audit_closure`, pantalla cierre base).

## Esquema y versión

- [ ] T1 — Crear `src/lib/server/canonical/version.ts` con `CANONICAL_SCHEMA_VERSION = '1.0'`. Cubre: **R1, R20**.
- [ ] T2 — Crear `src/lib/server/canonical/types.ts` (tipos base). Cubre: **R2**.
- [ ] T3 — Implementar `src/lib/server/canonical/schema.ts` con `canonicalAuditSchema` y sub-schemas (client, section, item, market_data, indices). Cubre: **R16, R20**.

## Builder y market_data

- [ ] T4 — Implementar `src/lib/server/canonical/market-data.ts` con mapeo `client` + ítem `cab_modulos_tango`. Cubre: **R11, R12, R13**.
- [ ] T5 — Implementar `src/lib/server/canonical/build.ts`: agregación completa desde DB (secciones, ítems, scores, closure, attachments). Cubre: **R2, R3, R4, R9, R10, R18, R19**.
- [ ] T6 — Validar salida del builder con `canonicalAuditSchema.parse` antes de retornar. Cubre: **R16**.
- [ ] T7 — Crear `src/lib/server/canonical/errors.ts` (`AuditNotClosedError`, `CanonicalBuildError`). Cubre: **R8**.

## Preview compartido

- [ ] T8 — Implementar `src/lib/server/canonical/preview.ts` (`buildReportPreview`, `stripInternalFindings`). Cubre: **R14, R15**.
- [ ] T9 — Refactorizar load de `auditorias/[id]/cierre/+page.server.ts` (#8) para usar builder + preview compartidos. Cubre: **R14**.
- [ ] T10 — Ajustar componente preview de cierre para consumir `ReportPreview` tipado. Cubre: **R14**.

## Endpoint export

- [ ] T11 — Crear `src/routes/api/audits/[id]/export/+server.ts` (GET, admin-only, JSON directo). Cubre: **R5, R7**.
- [ ] T12 — Añadir header `X-Schema-Version` en respuesta export. Cubre: **R6**.
- [ ] T13 — Manejar 404/409 con errores tipados (audit inexistente / no cerrada). Cubre: **R7, R8**.

## Fixtures

- [ ] T14 — Crear fixture de audit cerrada en `tests/fixtures/` (combo IT+ERP con scores, CAB, attachments mock). Cubre: **R2, R17**.
- [ ] T15 — Generar `tests/fixtures/canonical-audit-golden.json` desde builder sobre fixture. Cubre: **R17**.
- [ ] T16 — Verificar ítem `cab_modulos_tango` en seed de plantillas; añadir si falta. Cubre: **R12**.

## Tests unitarios

- [ ] T17 — Crear `tests/canonical-schema.test.ts` (versión, schema acepta/rechaza). Cubre: **R1, R16, R20**.
- [ ] T18 — Crear `tests/canonical-builder.test.ts` (payload completo, market_data, score_basis, score_contribution, attachments, indices). Cubre: **R2–R4, R9–R13, R18, R19**.
- [ ] T19 — Crear `tests/canonical-preview.test.ts` (coherencia con canonical, upsell interno, strip). Cubre: **R14, R15**.
- [ ] T20 — Crear `tests/canonical-contract.test.ts` (coherencia scores + snapshot vitest). Cubre: **R10, R17**.

## Tests API

- [ ] T21 — Crear `tests/api/audit-export.test.ts` (200 admin + header, 401, 403 técnico, 409 no cerrada). Cubre: **R5–R8**.

## Verificación final

- [ ] T22 — Ejecutar `pnpm test` (todos los tests contrato verdes). Cubre: todos.
- [ ] T23 — Ejecutar `./init.sh` exit 0. Cubre: todos.
- [ ] T24 — Documentar trazabilidad R→test en `progress/impl_09_contrato_datos.md`. Cubre: todos.

## Trazabilidad esperada (plantilla)

```markdown
## Trazabilidad
- R1 → tests/canonical-schema.test.ts > CANONICAL_SCHEMA_VERSION is 1.0
- R2 → tests/canonical-builder.test.ts > builds full canonical payload
- R3 → tests/canonical-builder.test.ts > payload schema_version matches constant
- R4 → tests/canonical-builder.test.ts > generated_at is ISO 8601
- R5 → tests/api/audit-export.test.ts > GET export returns canonical JSON
- R6 → tests/api/audit-export.test.ts > X-Schema-Version header
- R7 → tests/api/audit-export.test.ts > 401/403 auth
- R8 → tests/api/audit-export.test.ts > 409 when not closed
- R9 → tests/canonical-builder.test.ts > score_basis auto
- R10 → tests/canonical-contract.test.ts > score_contribution coherence
- R11 → tests/canonical-builder.test.ts > market_data keys
- R12 → tests/canonical-builder.test.ts > market_data mapping
- R13 → tests/canonical-builder.test.ts > null for missing fields
- R14 → tests/canonical-preview.test.ts > preview matches canonical
- R15 → tests/canonical-preview.test.ts > upsell internal handling
- R16 → tests/canonical-schema.test.ts > schema accept/reject
- R17 → tests/canonical-contract.test.ts > snapshot match
- R18 → tests/canonical-builder.test.ts > attachments r2_key
- R19 → tests/canonical-builder.test.ts > indices per type
- R20 → design.md § Versionado + schema semver test
```
