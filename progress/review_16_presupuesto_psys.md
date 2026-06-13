# Review — feature 16_presupuesto_psys

**Veredicto:** APPROVED

## Trazabilidad

| Req | Test(s) | Estado |
|---|---|---|
| R1 | `tests/api/psys-proposal.test.ts` — 401/403 POST; GET sync 403 | [x] |
| R2 | `tests/api/psys-proposal.test.ts` — 409 borrador, mock sin llamadas | [x] |
| R3 | `tests/api/psys-proposal.test.ts` — 503 sin env; `tests/psys-client.test.ts` — PsysConfigError | [x] |
| R4 | `tests/psys-payload.test.ts` — schema válido/inválido (builder + rechazo) | [x] |
| R5 | `tests/psys-client.test.ts` — Authorization + Idempotency-Key | [x] |
| R6 | `tests/api/psys-proposal.test.ts` — segundo POST 200; `tests/db/psys-link.test.ts` — UNIQUE | [x] |
| R7 | `tests/api/psys-proposal.test.ts` — persistencia 201; `tests/db/psys-link.test.ts` — fila error | [x] |
| R8 | `tests/api/psys-proposal.test.ts` — 502 + reintento; `tests/psys-client.test.ts` — 500/timeout | [x] |
| R9 | `tests/api/psys-proposal.test.ts` — remoto 200; `tests/psys-client.test.ts` — alreadyExisted | [x] |
| R10 | `tests/api/psys-sync.test.ts` — borrador → enviado + synced_at | [x] |
| R11 | `tests/api/psys-sync.test.ts` — estado inventado + logger.warn | [x] |
| R12 | `tests/api/psys-sync.test.ts` — sync_error sin modificar fila | [x] |
| R13 | `tests/ui/psys-card.test.ts` — helpers + inspección componente | [x] |
| R14 | `tests/psys-payload.test.ts` — internal_notes only | [x] |
| R15 | `tests/psys-payload.test.ts` — PSYS_CONTRACT_VERSION = '1.0' | [x] |
| R16 | `tests/db/psys-link.test.ts` — UNIQUE; `tests/api/psys-proposal.test.ts` — colisión 200 | [x] |

**26 tests** en 6 suites psys; todos verdes en `./init.sh` (489 vitest total).

## Tasks

| Task | Estado |
|---|---|
| T1 — Migración `007_psys_link.sql` | [x] |
| T2 — Schemas y contrato | [x] |
| T3 — Builder de payload | [x] |
| T4 — Cliente HTTP | [x] |
| T5 — Capa DB | [x] |
| T6 — Endpoint POST | [x] |
| T7 — Endpoint GET (sync) | [x] |
| T8 — UI psys-card | [x] |
| T9 — Env y docs | [x] |
| T10 — Verificación final | [x] |

## Acceptance (feature_list.json #16)

| Criterio | Rs | Estado |
|---|---|---|
| Crear presupuesto (admin) + payload Zod + cliente/CUIT en payload | R1, R2, R4 | [x] |
| Auth M2M API key; sin key → 503 sin efectos | R3, R5 | [x] |
| Persistencia proposal_id / number_display / URL | R7 | [x] |
| Estado visible en detalle; sync polling on-demand | R10–R13 | [x] |
| Contrato versionado en specs + `PSYS_CONTRACT_VERSION` | R15, design §Contrato | [x] |
| Idempotencia local/remota/concurrente | R5, R6, R9, R16 | [x] |
| Tests con presupuestossys mockeado | R1–R16 | [x] |

## Checkpoints

| Checkpoint | Estado | Notas |
|---|---|---|
| C1 — Arnés completo | [x] | `./init.sh` exit 0 |
| C2 — Estado coherente | [x] | Tests verdes; feature → `done` |
| C3 — Arquitectura | [x] | Capas respetadas; SQL parametrizado; secretos en env |
| C4 — Verificación real | [x] | 489 tests vitest pasan |
| C5 — Sesión cerrada | [ ] | Pendiente lifecycle: mover resumen a `history.md`, vaciar `current.md` |
| C6 — SDD | [x] | Spec EARS completo; tasks [x]; R↔test cubierto |

## Observaciones (no bloqueantes)

1. `specs/16_presupuesto_psys/design.md` referencia migración `006_psys_link.sql`; la implementación usa `007_psys_link.sql` (correcto en repo).
2. `specs/README.md` aún marca #16 como `in_progress`; actualizar en cierre de sesión.

## Cambios requeridos

Ninguno.
