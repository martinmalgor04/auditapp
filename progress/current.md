# Sesión — #60 Escaneo ingesta API (2026-08-27)

## Objetivo

Implementar la feature #60 `60_escaneo_ingesta_api` según el spec aprobado en
puerta humana (2026-08-27): migración 031, tokens de escaneo (emisión staff,
rotación, revocación), endpoints del agente (GET estado, consentimiento,
dispositivos, estado), endpoint de sistema para escaneos colgados, rate
limits y tests de integración API contra Postgres real.

## Estado

- Las 13 tasks de `specs/60_escaneo_ingesta_api/tasks.md` completadas `[x]`.
- 29/29 tests nuevos verdes en `tests/api/escaneos-*.test.ts` (4 archivos).
- Migración 031 aplicada y re-corrida verificada no-op.
- Mapa de trazabilidad R1–R30 y desviaciones en
  `progress/impl_60_escaneo_ingesta_api.md`.
- Entorno VM: Postgres 16 vía apt (Docker no disponible), rol/DB `auditapp`.
- Zombies vitest del hook `afterFileEdit`/timeouts matados entre corridas
  (problema documentado desde #59).
- Pendiente al momento de este escrito: gates completos (`pnpm test`,
  `pnpm run check`, `pnpm run build`, `./init.sh`) con baseline comparada —
  resultados en el reporte final y en el impl doc.

## Próximo paso

Reviewer: verificar trazabilidad R↔test contra
`progress/impl_60_escaneo_ingesta_api.md` y gates. El leader cambia el estado
en `feature_list.json` tras el review (el implementer no lo toca).
