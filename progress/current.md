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
- Gates con baseline comparada contra master limpio (misma VM):
  `pnpm test` 1566 passed / 14 failed (las 14 = baseline exacta de master,
  1537 + 29 nuevos; cero fallas nuevas) · `pnpm run check` 7 errores
  preexistentes, cero nuevos · `pnpm run build` verde · `./init.sh` con FAIL
  preexistentes (feature 7 sin specs en master + las 14 fallas).
- Mapa de trazabilidad R1–R30, desviaciones y notas de verificación en
  `progress/impl_60_escaneo_ingesta_api.md`.
- Entorno VM: Postgres 16 vía apt (Docker no disponible), rol/DB `auditapp`.
- Nota operativa: no editar archivos mientras corre la suite — el hook
  `afterFileEdit` dispara un `pnpm test` concurrente que puede truncar la DB
  bajo archivos SKIP_DB_RESET (flaky `encuesta-schema` observado y explicado
  en el impl doc).

## Próximo paso

Reviewer: verificar trazabilidad R↔test contra
`progress/impl_60_escaneo_ingesta_api.md` y gates. El leader cambia el estado
en `feature_list.json` tras el review (el implementer no lo toca).
