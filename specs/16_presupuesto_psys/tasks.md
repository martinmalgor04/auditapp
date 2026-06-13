# Tasks — #16 16_presupuesto_psys

> Orden de ejecución. Cada task referencia los R<n> de `requirements.md`.
> Todo test contra presupuestossys usa mock HTTP (fetch stubbeado / msw); nunca el servicio real.
> El implementer NO toca el repo `~/presupuestossys` (Anexo A del design es backlog de allá).

- [x] **T1 — Migración `007_psys_link.sql`**: tabla `audit_proposal_link` con CHECK de coherencia, UNIQUE parcial `(audit_id, report_id) WHERE status='activo'` e índices. Test `tests/db/psys-link.test.ts`: doble insert activo viola UNIQUE; fila error exige `error_message`. (R6, R7, R16)
- [x] **T2 — Schemas y contrato**: `src/lib/server/psys/schemas.ts` con `PSYS_CONTRACT_VERSION = '1.0'`, `psysProposalPayloadSchema`, `psysProposalResponseSchema`, `PSYS_PROPOSAL_STATUSES`. Test `tests/psys-payload.test.ts` (parte 1): constante y rechazo de payloads inválidos. (R4, R11, R15)
- [x] **T3 — Builder de payload**: `src/lib/server/psys/payload.ts` — `buildPsysPayload` desde `audit_report` aprobado + snapshot canónico; recomendaciones y upsell solo bajo `internal_notes`. Test `tests/psys-payload.test.ts` (parte 2): fixture de #14 produce payload válido; `internal_notes` no se filtra a `inputs`. (R4, R14)
- [x] **T4 — Cliente HTTP**: `src/lib/server/psys/client.ts` — `createPsysProposal` / `getPsysProposal` con Bearer + `Idempotency-Key`, timeout 10 s, errores `PsysConfigError`/`PsysRemoteError`. Test `tests/psys-client.test.ts`: headers correctos, 503-config, mapeo de 500/timeout a `PsysRemoteError`, parseo 201 y 200-existente. (R3, R5, R8, R9)
- [x] **T5 — Capa DB**: `src/lib/server/db/psys-links.ts` — find activo, insert activo, insert error, update sync; SQL parametrizado postgres.js. Test en `tests/db/psys-link.test.ts`. (R6, R7, R12, R16)
- [x] **T6 — Endpoint POST** `src/routes/api/audits/[id]/proposal/+server.ts`: guards admin, 409 sin informe aprobado, 503 sin config, early-return 200 con link activo, llamada al cliente, persistencia activo/error, manejo de colisión UNIQUE → devolver vínculo ganador. Tests `tests/api/psys-proposal.test.ts`: 401/403, 409, 503, flujo feliz 201, remoto-200 existente, error remoto → 502 + fila error, reintento tras error vuelve a llamar, segundo POST no duplica, carrera UNIQUE → 200. (R1–R9, R16)
- [x] **T7 — Endpoint GET (sync)**: misma ruta, método GET — consulta remota, update `psys_status`/`synced_at`, estado fuera de enum → conserva + warning, fallo remoto → `sync_error: true` sin escribir. Tests `tests/api/psys-sync.test.ts`. (R1, R10, R11, R12)
- [x] **T8 — UI**: `src/lib/components/auditoria/psys-card.svelte` + carga en `+page.server.ts` del detalle: número, estado traducido, link externo, botón «Crear presupuesto» (admin, solo con informe aprobado y sin link activo) y «Actualizar estado». Test componente `tests/ui/psys-card.test.ts`. (R13)
- [x] **T9 — Env y docs**: `PSYS_API_URL`/`PSYS_API_KEY` en `.env.example`; nota de integración en `docs/architecture.md` apuntando a `specs/16_presupuesto_psys/design.md` §Contrato. (R3, R15)
- [x] **T10 — Verificación final**: `./init.sh`, `pnpm run check`, `pnpm test` verdes; revisar trazabilidad R1–R16 ↔ tests; actualizar `specs/README.md`. (gate)
