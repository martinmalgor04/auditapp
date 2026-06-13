# Trazabilidad R → test — #16 16_presupuesto_psys

| Req | Test |
|---|---|
| R1 | `tests/api/psys-proposal.test.ts` — 401/403 POST y GET |
| R2 | `tests/api/psys-proposal.test.ts` — 409 borrador, mock sin llamadas |
| R3 | `tests/api/psys-proposal.test.ts` — 503 sin env; `tests/psys-client.test.ts` — PsysConfigError |
| R4 | `tests/psys-payload.test.ts` — schema válido/inválido |
| R5 | `tests/psys-client.test.ts` — Authorization + Idempotency-Key |
| R6 | `tests/api/psys-proposal.test.ts` — segundo POST 200; `tests/db/psys-link.test.ts` — UNIQUE |
| R7 | `tests/api/psys-proposal.test.ts` — persistencia POST 201; `tests/db/psys-link.test.ts` — fila error |
| R8 | `tests/api/psys-proposal.test.ts` — 502 + reintento; `tests/psys-client.test.ts` — 500/timeout |
| R9 | `tests/api/psys-proposal.test.ts` — remoto 200; `tests/psys-client.test.ts` — alreadyExisted |
| R10 | `tests/api/psys-sync.test.ts` — borrador → enviado + synced_at |
| R11 | `tests/api/psys-sync.test.ts` — estado inventado + logger.warn |
| R12 | `tests/api/psys-sync.test.ts` — sync_error sin modificar fila |
| R13 | `tests/ui/psys-card.test.ts` — helpers + inspección componente |
| R14 | `tests/psys-payload.test.ts` — internal_notes only |
| R15 | `tests/psys-payload.test.ts` — PSYS_CONTRACT_VERSION = '1.0' |
| R16 | `tests/db/psys-link.test.ts` — UNIQUE; `tests/api/psys-proposal.test.ts` — colisión 200 |

Migración: `migrations/007_psys_link.sql`.
