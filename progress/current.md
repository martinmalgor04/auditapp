# Sesión — Implementación #61 `61_agente_scan` (2026-08-31)

## Objetivo

Implementar la feature #61 (agente de escritorio `sys-scan-agent`) según
`specs/61_agente_scan/`. Puerta humana: aprobada por instrucción directa del
usuario (2026-08-31) → status `in_progress`.

## Estado

- Entorno: `node_modules` instalado, PostgreSQL 16 local levantado
  (usuario/DB `auditapp`). `./init.sh` corre la suite completa.
- **Fallos preexistentes en master (NO de esta feature, verificados con
  working tree limpio):**
  - `feature_list.json`: feature 7 `done` sin `specs/07_form_tecnico/`.
  - 15 tests rotos: `tests/canonical-contract.test.ts` (snapshot),
    `tests/informe-manual.test.ts` (columna `client_id` inexistente +
    timeouts en cascada), `tests/api/report-html-download.test.ts`
    (`searchParams` undefined).
- **Limitación de herramientas:** no existe el repo remoto
  `serviciosysistemas/sys-scan-agent` y no puedo crearlo (gh read-only).
  Estrategia: el código del agente vive en el subdirectorio autocontenido
  `sys-scan-agent/` (go.mod propio, CI propio, cero imports al repo padre),
  listo para extraer con
  `git filter-repo --subdirectory-filter sys-scan-agent` cuando el humano
  cree el repo. Documentado en `sys-scan-agent/README.md`.
- **Sin Docker ni LAN real en este entorno:** T16 queda implementado con
  build tag `integration` (corre en CI con Docker); T17 (prueba de campo)
  queda pendiente para el humano — checklist listo en
  `progress/impl_61_agente_scan.md`.
- **Discrepancia spec:** T15 de `tasks.md` dice "firmado" pero R2 y la
  puerta 2026-08-27 dicen SIN firma en v1. Se implementa R2 (sin firma) y
  queda asentado en la trazabilidad.

## Plan (tasks del spec)

- [ ] T1 — `scripts/export-escaneo-schema.ts` (auditapp) — R25
- [ ] T2 — `static/agente/version.json` (auditapp) — R29
- [ ] T3 — Scaffolding agente Wails v2 + Svelte 5 + Tailwind — R1, R31
- [ ] T4 — `internal/creds` + `internal/logx` — R9, R11, R12
- [ ] T5 — `internal/queue` SQLite — R18, R19
- [ ] T6 — `internal/sync` cliente #60 — R13, R28, R30
- [ ] T7 — `internal/nmaphost` ARP host — R4, R5, R7
- [ ] T8 — Imagen `sys-openaudit` + CI GHCR — R21, R22
- [ ] T9 — `internal/dockerx` — R3, R21, R22, R24, R32
- [ ] T10 — `internal/openaudit` REST + verificación de mapeo — R23, R25
- [ ] T11 — `internal/normalize` — R6, R25, R26, R27
- [ ] T12 — `internal/scan` orquestador — R13–R15, R17, R18, R20, R32
- [ ] T13 — UI Svelte — R7, R13, R14, R16, R29, R31
- [ ] T14 — Cierre y purga — R10, R24
- [ ] T15 — Empaquetado CI sin firma (v1) — R2, R29, R30
- [ ] T16 — Integración CI (build tag `integration`) — R13–R19, R22, R23
- [ ] T17 — Prueba de campo LAN real — BLOQUEADA (sin LAN en cloud)
- [ ] T18 — Gates + trazabilidad — R1–R32

## Próximo paso

T1: script de export de JSON Schema desde los Zod de #59.
