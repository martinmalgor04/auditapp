# Review — feature 41_referencia_auditoria

**Veredicto:** APPROVED

## Re-review (2026-06-23)

Los dos bloqueos del review anterior quedaron resueltos.

---

## Trazabilidad

| Req | Test(s) | Estado |
|-----|---------|--------|
| R1 | `tests/clients/empresa-code.test.ts` | ✅ |
| R2 | `tests/clients/empresa-codigo-collision.test.ts` (`ensureEmpresaCodigo`: ISX → ISX2) | ✅ |
| R3 | `tests/backoffice/ref-immutability.test.ts` | ✅ |
| R4 | `tests/migrations/audit_ref_code.test.ts` | ✅ |
| R5 | `tests/clients/empresa-code.test.ts`, `tests/migrations/audit_ref_code.test.ts` | ✅ |
| R6 | `tests/clients/empresa-code.test.ts` (`formatRefCode`) | ✅ |
| R7 | `tests/migrations/audit_ref_code.test.ts`, `tests/backoffice/duplicate-guard.test.ts`, `tests/backoffice/audit-ref-concurrency.test.ts` | ✅ |
| R8 | `tests/backoffice/audit-ref-concurrency.test.ts` | ✅ |
| R9 | `tests/backoffice/ref-immutability.test.ts` | ✅ |
| R10 | `tests/migrations/audit_ref_code.test.ts` | ✅ |
| R11 | `tests/migrations/audit_ref_code.test.ts` | ✅ |
| R12 | `tests/migrations/audit_ref_code.test.ts`, `tests/backoffice/single-type.test.ts` | ✅ |
| R13 | `tests/migrations/audit_ref_code.test.ts` | ✅ |
| R14 | `tests/backoffice/single-type.test.ts` | ✅ |
| R15 | `tests/backoffice/single-type.test.ts` | ✅ |
| R16 | `tests/backoffice/dashboard-ref.test.ts` | ✅ |
| R17 | `tests/backoffice/routes-still-uuid.test.ts` (`getAuditById.refCode`) | ✅ |
| R18 | `tests/informe/ref-code-render.test.ts`, `tests/api/report-html-download.test.ts` | ✅ |
| R19 | `tests/psys/payload-ref.test.ts`, `tests/api/psys-proposal.test.ts` | ✅ |
| R20 | `tests/briefing/ref-code.test.ts` | ✅ |
| R21 | `tests/backoffice/duplicate-guard.test.ts` | ✅ |
| R22 | `tests/backoffice/duplicate-guard.test.ts` (assert `conflicts[]`: refCode, status, encargada vs DB) | ✅ |
| R23 | `tests/backoffice/duplicate-guard.test.ts` | ✅ |
| R24 | `tests/backoffice/duplicate-guard.test.ts` | ✅ |
| R25 | `tests/backoffice/routes-still-uuid.test.ts` | ✅ |

---

## Tasks

| Task | Estado |
|------|--------|
| T1–T25 | ✅ todas `[x]` en `specs/41_referencia_auditoria/tasks.md` |

---

## Acceptance criteria (`feature_list.json` id 41)

| Criterio | Estado |
|----------|--------|
| `empresa.codigo` único NOT NULL autogenerado | ✅ |
| `ref_code` formato `<EMP>-<TIPO>-<NNNN>` correlativo | ✅ |
| Asignación atómica + inmutabilidad | ✅ |
| Backfill legacy multi-tipo tipo líder | ✅ |
| Un solo tipo al crear; legacy legible | ✅ |
| `ref_code` en tablero, detalle, cierre/informe, psys, briefing | ✅ |
| Guard anti-duplicado + confirmDuplicate | ✅ |
| Rutas/FKs siguen UUID | ✅ |
| Suite de tests requerida | ✅ |

---

## Checkpoints

| Checkpoint | Estado |
|------------|--------|
| C1 — Arnés + `./init.sh` verde | ✅ |
| C2 — Una feature `in_progress`; tests pasan | ✅ (pasa a `done`) |
| C3 — SQL parametrizado, capas respetadas | ✅ |
| C4 — Vitest 1107 passed | ✅ |
| C5 — Sesión cerrada | ✅ |
| C6 — Spec EARS + tasks `[x]`; trazabilidad R↔test | ✅ |

---

## Verificación ejecutada

```bash
./init.sh   # exit 0 — [OK] Entorno listo. 1107 passed | 2 skipped
```

---

## Fixes verificados (review anterior)

1. **R2** — `tests/clients/empresa-codigo-collision.test.ts`: inserta `ISX` ocupado, llama `ensureEmpresaCodigo` con razón social que produce base `ISX` → asigna `ISX2`.
2. **R22** — `duplicate-guard.test.ts` "ERP activa → aviso": assert `conflicts.length >= 1`, formato `refCode`, `status` truthy, `encargada` string|null, y coincidencia con fila en DB.

---

## Notas

- Migraciones `022`–`024` idempotentes; concurrencia y guard operativos.
- Contrato psys v1.1 con `source.ref_code` obligatorio.
- Mapa R17 corregido en `progress/impl_41_referencia_auditoria.md`.
