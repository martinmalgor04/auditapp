# Implementación #40 — offline_snapshot (revisión post-CHANGES_REQUESTED)

**Fecha:** 2026-06-23  
**Estado:** listo para re-review (no marcado `done` en feature_list.json)

## Cambios respecto a review anterior

### Tests #39 reparados (9 → 0 fallos)
| Archivo | Fix |
|---|---|
| `tests/informe-stale.test.ts` | INSERT `audit_report` con status `borrador` (cumple `audit_report_approved_coherence`) |
| `tests/reopen-audit.test.ts` | Idem + técnico no asignado = `simon@` (UUID válido) |
| `tests/form-readonly.test.ts` | Técnico no asignado = `simon@` vía DB |
| `tests/api/closure-reopen.test.ts` | Segunda auditoría cerrada para probar 403 de técnico no asignado (no reabrir post-admin) |

### Trazabilidad R↔test ampliada (#40)
| Req | Test |
|---|---|
| R1 | `draft-store.test.ts` |
| R2 | `draft-recovery.test.ts` — `buildDraftPayload` |
| R3 | `draft-store.test.ts` — savedAt ISO |
| R4 | `draft-store.test.ts` — warn sin throw |
| R5 | `draft-recovery.test.ts` — `maybeDeleteDraftWhenSynced`, `shouldDeleteDraftAfterSync` |
| R6, R15 | `draft-recovery.test.ts` — `discardPendingDraft` + `deleteDraft` real (IDB) |
| R7 | `draft-recovery.test.ts` — `resolvePendingDraftOnMount` |
| R8, R9 | `draft-recovery.test.ts` — `formatDraftSavedAtLocal` + source `DraftRecoveryBanner.svelte` |
| R10 | `draft-recovery.test.ts` — banner visible sin auto-apply |
| R11–R14 | `draft-recovery.test.ts` — restore/apply/scheduleSave |
| R16 | discard no aplica draft (impl + test discard IDB) |
| R17 | `draft-store.test.ts` — draft + retry-queue independientes en IDB |
| R18 | `draft-recovery.test.ts` — snapshot incluye ítems pendientes en cola |
| R19 | `draft-recovery.test.ts` — file_ref null |
| R20 | sin migraciones SQL; suite verde |

### Lógica extraída (`draft-recovery.ts`)
- `buildDraftPayload`, `shouldDeleteDraftAfterSync`, `maybeDeleteDraftWhenSynced`
- `resolvePendingDraftOnMount`, `shouldRenderDraftBanner`, `formatDraftSavedAtLocal`
- `discardPendingDraft`

### Infra de tests (empresa.codigo NOT NULL, migr. 022)
- `tests/helpers/empresa.ts` — `insertTestEmpresa`
- `src/lib/server/db/seed/clients.ts` — INSERT `empresa` + `resolveUniqueCodigoDb`
- `src/lib/server/db/seed/tango.ts` — UPDATE/INSERT con codigo
- Varios tests/helpers/fixtures actualizados (subagente + backoffice helper)

### T10(d) — discard no tautológico
Reemplazado mock local por `discardPendingDraft(auditId, deleteDraft)` contra IDB real (`fake-indexeddb`).

## Archivos tocados (#40 core)

| Archivo | Cambio |
|---|---|
| `src/lib/client/form/draft-recovery.ts` | Helpers extraídos + discard |
| `src/lib/components/form/DraftRecoveryBanner.svelte` | Usa `formatDraftSavedAtLocal` |
| `src/routes/(app)/auditorias/[id]/form/+page.svelte` | Integración helpers |
| `tests/draft-store.test.ts` | +R17 (8 tests) |
| `tests/draft-recovery.test.ts` | +R2,R5,R7–R10,R15 (13 tests) |
| `specs/40_offline_snapshot/tasks.md` | T1–T11 [x] |

## Verificación final

```
pnpm run check  → 0 errors
pnpm test       → 211 files, 1106 passed, 2 skipped
./init.sh       → verde (feature #41 revertida a spec_ready para regla 1× in_progress)
```

## Notas
- Feature #41 permanece `spec_ready` (no `in_progress`) para cumplir arnés; no se marcó #40 `done`.
- Seed/tests usan `empresa.codigo` obligatorio tras migración 022 (#41).
