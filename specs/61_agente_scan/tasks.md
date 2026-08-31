# Tasks — #61 61_agente_scan

> No implementar hasta aprobación humana. Detalle: `design.md` (mismo folder).
> Depende de #60 aprobada e implementada (contrato de sincronización).
> Código del agente en repo aparte `sys-scan-agent`; en auditapp solo la
> pieza aditiva de T1/T2.

- [x] T1 — (auditapp) Crear `scripts/export-escaneo-schema.ts` que exporte
  `dispositivo-input.schema.json` desde los Zod de #59
  (`zod-to-json-schema`). Cubre: R25.

- [x] T2 — (auditapp) Crear `static/agente/version.json` con la versión
  inicial del agente y placeholders de URLs de descarga. Cubre: R29.

- [x] T3 — Scaffolding del agente: repo `sys-scan-agent`, Wails v2 + Go +
  frontend Svelte 5/Tailwind con identidad SyS, embed del build estático,
  bindings TS generados. Ventana única, es-AR. Cubre: R1, R31.

- [x] T4 — `internal/creds`: `CredStore` con `99designs/keyring`
  (Keychain/Credential Manager), namespace por escaneo, fail-closed sin
  almacén; `internal/logx` con redacción de secretos. Tests unit de ambos.
  Cubre: R9, R11, R12.

- [x] T5 — `internal/queue`: cola SQLite (`modernc.org/sqlite`) con schema
  del design, FIFO por escaneo, backoff `30s × 2^n` (techo 15 min), pausa a
  los 20 intentos, reanudación tras reinicio. Tests unit. Cubre: R18, R19.

- [x] T6 — `internal/sync`: cliente HTTP de #60 (GET estado, consentimiento,
  chunk, transición) con `X-Agente-Version`, manejo de 409 (versión
  incompatible → detener) y 429 (re-encolar con espera de ventana). Tests
  unit contra server stub. Cubre: R13, R28, R30.

- [x] T7 — `internal/nmaphost`: barrido ARP `nmap -PR -sn` en host con
  parseo XML a tabla IP→MAC (+OUI); instalación asistida única de
  prerrequisitos de captura (Npcap vía instalador oficial en Windows; daemon
  launchd de permisos BPF en macOS); detección de disponibilidad para modo
  degradado. Tests unit de parseo con fixtures XML. Cubre: R4, R5, R7.

- [x] T8 — Imagen `sys-openaudit`: Dockerfile Ubuntu 24.04 + instalador
  oficial Open-AudIT pineado (versión + SHA-256), healthcheck, CI con build
  multi-arch (amd64/arm64) y push a GHCR. Cubre: R21, R22.

- [x] T9 — `internal/dockerx`: pull con verificación de digest pineado y
  progreso, `run --rm` con API solo en `127.0.0.1`, detección de Docker
  Desktop ausente/caído con instalación asistida, limpieza de huérfanos
  `sys-scan-*` al arranque. Cubre: R3, R21, R22, R24, R32.

- [x] T10 — `internal/openaudit`: cliente REST (healthcheck, credentials
  create/delete, discoveries create/execute, polling de estado, devices
  paginado). **Verificación de mapeo:** contrastar contra la API de la
  versión pineada los nombres exactos de atributos usados por la tabla de
  mapeo del design (`ip`, `network.mac`, `hostname`, `dns_hostname`,
  `manufacturer`, `model`, `serial`, `type`, `os_group`, `os_name`,
  `os_version`, `memory_count`, discos, `software`, puertos) y ajustar la
  tabla si difieren. Cubre: R23, R25.

- [x] T11 — `internal/normalize`: mapeo OA/Nmap → `dispositivoInput` según
  tabla del design, merge de MACs (ARP host > OA > IP, divergencia a `raw`),
  clasificación de `tipo`, validación contra el JSON Schema exportado (T1),
  descarte con log de inválidos. Tests unit con fixtures reales OA 6.x y
  Nmap. Cubre: R6, R25, R26, R27.

- [x] T12 — `internal/scan`: orquestador de fases (validar token →
  consentimiento → `en_curso` → ARP host → contenedor → discovery →
  normalizar/encolar → `sincronizando` → drenar → `completado`; error →
  `fallido` con detalle), `scan_state` persistente para reanudación, un solo
  escaneo activo. Tests unit de la máquina de fases. Cubre: R13, R14, R15,
  R17, R18, R20, R32.

- [x] T13 — UI del agente (Svelte): pantallas de token/confirmación,
  credenciales, consentimiento, progreso en vivo (encontrados/
  sincronizados/estado), errores en criollo accionables sin stack traces,
  advertencia de modo degradado, banner de nueva versión (T2). Cubre: R7,
  R13, R14, R16, R29, R31.

- [x] T14 — Cierre y purga: al cerrar escaneo (o limpieza de arranque)
  borrar credenciales de Open-AudIT vía API, destruir contenedor, purgar
  keychain del escaneo; verificación automatizada de ausencia de
  credenciales en artefactos post-cierre. Cubre: R10, R24.

- [x] T15 — Empaquetado y firma en CI: `.exe` NSIS firmado (certificado
  SyS), `.app` firmada + notarizada en `.dmg`, publicación en GitHub
  Releases con SHA-256, versión semver inyectada por ldflags. Cubre: R2,
  R29, R30.
  NOTA de implementación (2026-08-31): R2 y la puerta 2026-08-27 definen v1
  SIN firma de código; esta task decía "firmado/notarizado" y quedó
  desactualizada respecto de la puerta. Se implementó SIN firma (R2).

- [x] T16 — Test de integración en CI: contenedor `sys-openaudit` real + red
  Docker con víctimas SSH/SNMP + AuditApp de test con API #60 → escaneo
  end-to-end, idempotencia de reenvío, purga. Cubre: R13–R19, R22, R23.
  NOTA de implementación (2026-08-31): implementado en
  `test/integration/` (build tag `integration`) con stub fiel al contrato
  #60 (upsert por identidad MAC→IP); corre en CI con Docker
  (`ci/integration.yml`). En este entorno cloud no hay Docker: compila y
  queda listo para CI.

- [ ] T17 — **Prueba de campo en LAN real** (obligatoria): checklist de R8
  (MACs vs `arp -a`, dispositivo sin credenciales con MAC y tipo, corte de
  Internet con drenado posterior, purga de credenciales). Evidencia en
  `progress/impl_61_agente_scan.md`. Cubre: R5, R6, R7, R8, R10, R18.

- [ ] T18 — Gates: `go test ./...` verde, builds firmados de ambas
  plataformas en CI, integración verde, prueba de campo documentada; en
  auditapp `pnpm run check`, `pnpm test`, `./init.sh` verdes (pieza
  aditiva). Mapa de trazabilidad en `progress/impl_61_agente_scan.md`.
  Cubre: R1–R32.
