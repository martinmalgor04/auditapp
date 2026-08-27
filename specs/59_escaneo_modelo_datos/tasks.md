# Tasks — #59 59_escaneo_modelo_datos

> No implementar hasta aprobación humana. Detalle: `design.md` (mismo folder).
> Decisiones de puerta 2026-08-27 ya aplicadas: consentimiento condicionado,
> multi-VLAN consolidada, sin purga, sin app aparte.

- [ ] T1 — Crear `migrations/030_escaneo_modelo_datos.sql` (tablas `escaneo`,
  `escaneo_dispositivo`, `escaneo_software`, `escaneo_servicio` con CHECKs,
  UNIQUEs, FKs e índices según design §Esquema; idempotente). Aplicar con el
  runner y verificar re-corrida no-op. Cubre: R1, R3, R5, R6, R9, R11, R14,
  R15, R16, R17, R19, R20, R21, R22, R23, R24.

- [ ] T2 — Crear `src/lib/server/escaneos/schemas.ts` (enums Zod,
  `macNormalizada`, `softwareInput`, `servicioInput`, `dispositivoInput`,
  `crearEscaneoInput`, `registrarConsentimientoInput`,
  `identidadDispositivo`, `TRANSICIONES`) y `errors.ts` (errores tipados
  según design §Errores). Cubre: R12, R15, R16.

- [ ] T3 — `repo.ts`: `crearEscaneo` (INSERT...SELECT con scope empresa) +
  `registrarConsentimiento`. Cubre: R1, R2, R8, R26, R27.

- [ ] T4 — `repo.ts`: `upsertDispositivos` transaccional (FOR UPDATE, upsert
  por identidad, COALESCE, software/servicios, update de
  `dispositivos_detectados`). Cubre: R4, R11, R12, R13, R14, R17, R18, R19,
  R20, R21, R22, R27, R28.

- [ ] T5 — `repo.ts`: `cambiarEstadoEscaneo` con validación de TRANSICIONES,
  consentimiento para `en_curso`, `error_detalle` para `fallido`, timestamps
  `iniciado_at`/`finalizado_at`. Cubre: R3, R8, R10.

- [ ] T6 — `repo.ts`: `listarEscaneosDeAuditoria`, `obtenerEscaneo`,
  `listarDispositivos` (paginado + filtros tipo/revisión), `marcarRevision`,
  `escaneosColgados`. Cubre: R7, R23, R24, R25, R26.

- [ ] T7 — `tests/escaneos.test.ts` contra Postgres real: los 14 casos de
  design §Tests, incluidos concurrencia (dos upserts simultáneos) y cascada
  de borrado. Cubre: R1–R28 (mapa en `progress/impl_59_escaneo_modelo_datos.md`).

- [ ] T8 — Gates: `pnpm test`, `pnpm run check`, `pnpm run build`, `./init.sh`
  verdes. Actualizar `progress/current.md`.
