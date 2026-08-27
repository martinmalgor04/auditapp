# Tasks — #60 60_escaneo_ingesta_api

> No implementar hasta aprobación humana. Detalle: `design.md` (mismo folder).
> Depende de #59 mergeada (o rebase sobre `cursor/59-escaneo-modelo-datos-8007`).

- [x] T1 — Crear `migrations/031_escaneo_token.sql` (tabla `escaneo_token`
  con CHECKs, índice único por hash e índice parcial de token activo según
  design §Esquema; idempotente). Aplicar con el runner y verificar re-corrida
  no-op. Cubre: R1, R2, R3, R4.

- [x] T2 — Crear `src/lib/server/escaneos/api.ts` (`ESCANEO_TOKEN_TTL_HORAS`,
  `AGENTE_MAJOR_SOPORTADO`, `resolverAmbitoEscaneo`, `emitirTokenEscaneo`,
  `revocarTokenEscaneo`, `resolverTokenEscaneo`, `registrarAgente`) y
  `src/lib/server/escaneos/http.ts` (`chunkDispositivosInput`,
  `mapErrorEscaneo`). Cubre: R1, R3, R4, R5, R7, R8, R15, R19, R20, R21, R29.

- [x] T3 — Crear guards `src/lib/server/api/require-escaneo-token.ts`
  (Bearer → ámbito, 401 genérico, 404 en mismatch de path, log sin token) y
  `src/lib/server/api/require-system-token.ts` (env `ESCANEO_SYSTEM_TOKEN`,
  `timingSafeEqual`, fail-closed). Cubre: R7, R8, R9, R27, R30.

- [x] T4 — Crear `src/lib/server/api/escaneo-rate-limit.ts` (tres
  limitadores Map + prune, flag `ESCANEO_RATE_LIMIT_DISABLED`, reset para
  tests). Cubre: R23, R24, R25.

- [x] T5 — Rutas staff: `POST /api/escaneos` (crear con `requireStaffApi` +
  `techIsAssigned`, resolución de empresa desde la auditoría) y
  `POST`/`DELETE /api/escaneos/[escaneoId]/token` (emisión con rotación,
  revocación idempotente, mismos guards). Cubre: R1, R3, R4, R5, R6, R22.

- [x] T6 — Rutas agente: `GET /api/escaneos/[escaneoId]` (estado + contexto
  empresa/auditoría), `POST .../consentimiento`, `POST .../dispositivos`
  (límite de body, rate limit de ingesta, upsert + conteo) y
  `POST .../estado` (transición con mapeo de errores). Todas con
  `requireEscaneoToken` + `X-Agente-Version` (R19). Cubre: R8, R9, R10,
  R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R23, R24, R29.

- [x] T7 — Crear `src/lib/server/escaneos/jobs.ts` (`marcarColgadosFallidos`
  componiendo `escaneosColgados` + `resolverAmbitoEscaneo` +
  `cambiarEstadoEscaneo` de #59) y la ruta
  `POST /api/system/escaneos-colgados`. Cubre: R26, R27, R28.

- [x] T8 — Tests `tests/api/escaneos-token.test.ts`: casos de emisión,
  rotación, revocación, expiración y guards staff del design §Tests. Cubre:
  R1, R3, R4, R5, R6, R7.

- [x] T9 — Tests `tests/api/escaneos-ingesta.test.ts`: chunk feliz,
  idempotencia de reenvío, límites de tamaño, rate limit de ingesta y por
  IP, mismatch de path. Cubre: R9, R13, R14, R15, R23, R25.

- [x] T10 — Tests `tests/api/escaneos-estado.test.ts`: GET estado con
  contexto y en terminal, consentimiento, transiciones válidas/inválidas,
  `fallido` sin detalle, headers de versión. Cubre: R10, R11, R12, R16, R17,
  R18, R19, R20, R21, R24.

- [x] T11 — Tests `tests/api/escaneos-colgados.test.ts`: 401 sin token de
  sistema, marcado solo de >24 h con `error_detalle`, idempotencia del job.
  Cubre: R26, R27, R28.

- [x] T12 — Documentar en `docs/deploy-dokploy.md` la variable
  `ESCANEO_SYSTEM_TOKEN` y el cron externo del job (scheduler horario).
  Cubre: R26, R27.

- [x] T13 — Gates: `pnpm test`, `pnpm run check`, `pnpm run build`,
  `./init.sh` verdes. Mapa de trazabilidad en
  `progress/impl_60_escaneo_ingesta_api.md`. Actualizar
  `progress/current.md`. Cubre: R1–R30.
