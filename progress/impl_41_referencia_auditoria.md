# Implementación #41 — 41_referencia_auditoria

**Feature:** referencia legible `ref_code` + `empresa.codigo` + tipo único + guard anti-duplicado.  
**Estado:** implementación completa — pendiente reviewer (NO marcar `done`).  
**Verificación:** `pnpm run check` ✅ · `pnpm test` ✅ · `./init.sh` ✅ (post-fix reviewer R2/R22).

---

## Mapa R ↔ test

| Req | Descripción breve | Test(s) |
|-----|-------------------|---------|
| R1 | `buildEmpresaCode` iniciales | `tests/clients/empresa-code.test.ts` |
| R2 | Colisión runtime → sufijo numérico (`ISX` → `ISX2`) | `tests/clients/empresa-codigo-collision.test.ts` |
| R3 | `empresa.codigo` inmutable | `tests/backoffice/ref-immutability.test.ts` |
| R4 | `audit.ref_code` NOT NULL UNIQUE | `tests/migrations/audit_ref_code.test.ts` |
| R5 | Formato `EMP-TIPO-NNNN` | `tests/clients/empresa-code.test.ts`, `tests/migrations/audit_ref_code.test.ts` |
| R6 | Tokens IT/ERP/ERPE | `tests/clients/empresa-code.test.ts` |
| R7 | Correlativo por empresa+tipo | `tests/migrations/audit_ref_code.test.ts`, `tests/backoffice/audit-ref-concurrency.test.ts` |
| R8 | Asignación atómica en alta | `tests/backoffice/audit-ref-concurrency.test.ts`, `tests/backoffice/duplicate-guard.test.ts` |
| R9 | `ref_code` inmutable | `tests/backoffice/ref-immutability.test.ts` |
| R10 | Backfill `empresa.codigo` | `tests/migrations/audit_ref_code.test.ts` |
| R11 | Backfill `audit.ref_code` | `tests/migrations/audit_ref_code.test.ts` |
| R12 | Legacy multi-tipo → tipo líder IT | `tests/migrations/audit_ref_code.test.ts`, `tests/backoffice/single-type.test.ts` |
| R13 | Contador alineado al máximo | `tests/migrations/audit_ref_code.test.ts` |
| R14 | Un solo tipo al crear | `tests/backoffice/single-type.test.ts` |
| R15 | Lectura legacy multi-tipo OK | `tests/backoffice/single-type.test.ts` |
| R16 | `refCode` en tablero | `tests/backoffice/dashboard-ref.test.ts` |
| R17 | `refCode` en detalle | `tests/backoffice/routes-still-uuid.test.ts` (`getAuditById.refCode`) |
| R18 | `refCode` en informe/cierre | `tests/informe/ref-code-render.test.ts`, `tests/api/report-html-download.test.ts` |
| R19 | psys v1.1 `source.ref_code` | `tests/psys/payload-ref.test.ts`, `tests/api/psys-proposal.test.ts` |
| R20 | Briefing con `refCode` | `tests/briefing/ref-code.test.ts` |
| R21–R24 | Guard duplicados + confirm | `tests/backoffice/duplicate-guard.test.ts` (R22: payload `conflicts[]`) |
| R25 | Rutas siguen UUID | `tests/backoffice/routes-still-uuid.test.ts` |

---

## Migraciones

| Archivo | Contenido |
|---------|-----------|
| `022_audit_ref_code.sql` | Columnas, backfill, contador, inmutabilidad |
| `023_client_view_codigo.sql` | Refresca vista `client` |
| `024_audit_ref_insert_triggers.sql` | Auto-`codigo`/`ref_code` en INSERT NULL (tests/legacy) |

---

## Archivos clave tocados

- Dominio: `src/lib/server/clients/normalize.ts`, `src/lib/audit-types.ts`
- Alta/guard: `src/lib/server/backoffice/audits.ts`, `schemas.ts`, `errors.ts`, `form-parsers.ts`
- UI: tablero, detalle, `new/`, cierre, informe, briefing
- psys: schema v1.1 + payload
- Helpers test: `tests/helpers/empresa.ts`, `insertLegacyMixedAuditRow` en `backoffice.ts`

---

## Notas para reviewer

1. **R2:** `tests/clients/empresa-codigo-collision.test.ts` — `ensureEmpresaCodigo` con `ISX` ocupado → `ISX2`.
2. **R22:** `duplicate-guard.test.ts` assert sobre `conflicts[]` (`refCode`, `status`, `encargada`) vs fila en DB.
3. Auditorías legacy multi-tipo se seedean vía `insertLegacyMixedAuditRow`, no `createAudit`.
