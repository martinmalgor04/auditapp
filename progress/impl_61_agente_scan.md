# Implementación #61 — `61_agente_scan` (sys-scan-agent)

> Implementer: sesión 2026-08-31. Spec: `specs/61_agente_scan/`.
> Puerta humana: aprobada por instrucción directa del usuario (2026-08-31).

## Alcance entregado

**Pieza auditapp (este repo):**
- `scripts/export-escaneo-schema.ts` + `static/agente/dispositivo-input.schema.json`
  generado (T1, R25): JSON Schema draft-07 autocontenido desde los Zod de #59,
  con patrón de MAC normalizada inyectado (el transform Zod no es
  representable) y formatos `ipv4`/`ipv6` de `z.string().ip()`.
- `static/agente/version.json` (T2, R29): versión inicial 1.0.0 + URLs de
  descarga (placeholders del repo del org) + sha256 vacíos hasta el primer
  release.
- Tests: `tests/export-escaneo-schema.test.ts` (12), `tests/agente-version-json.test.ts` (3).

**Agente `sys-scan-agent/` (subdirectorio autocontenido — ver nota de repo):**
módulo Go propio (`github.com/serviciosysistemas/sys-scan-agent`), Wails v2.15
+ Svelte 5 + Tailwind con identidad SyS, CI propio en `ci/`, cero imports al
repo padre.

| Paquete | Contenido |
|---|---|
| `internal/creds` | Keyring OS (99designs/keyring), namespace por escaneo, fail-closed |
| `internal/logx` | slog con redacción de secretos (campos + valores registrados) y rotación 5×5MB |
| `internal/queue` | SQLite (modernc, sin CGO): cola FIFO, backoff 30s×2ⁿ techo 15m, pausa a 20, `scan_state` |
| `internal/sync` | Cliente #60: Bearer + X-Agente-Version, 409 versión vs conflicto, 429 con Retry-After |
| `internal/nmaphost` | Barrido ARP `nmap -PR -sn` en host, parseo XML, prerrequisitos por OS (Npcap/BPF) |
| `internal/dockerx` | Docker SDK: pull con progreso + digest pineado, run `--rm` solo 127.0.0.1, huérfanos, instalación asistida Docker Desktop |
| `internal/openaudit` | Cliente REST OA 6.x: credentials, discoveries, devices paginado con includes |
| `internal/normalize` | Mapeo OA/Nmap → `dispositivoInput`, merge MAC ARP>OA>IP, clasificación tipo, validación JSON Schema |
| `internal/scan` | Orquestador de fases con reanudación, un escaneo activo, purga completa |
| `internal/update` | Chequeo `version.json` con semver (pre-release < release) |
| `internal/app` | Wiring de dependencias reales + DTOs para bindings |
| `docker/sys-openaudit` | Dockerfile Ubuntu 24.04 + Open-AudIT 6.0.4 pineado (SHA-256 real de FirstWave) |
| `ci/` | test.yml, image.yml (multi-arch GHCR), release.yml (NSIS+dmg, sin firma v1), integration.yml |
| `test/integration/` | End-to-end con Docker real + stub fiel del contrato #60 (build tag `integration`) |

## Nota de repo (desviación por limitación de herramientas)

El design exige repo aparte `serviciosysistemas/sys-scan-agent`. El repo
remoto **no existe** y no puedo crearlo desde el agente cloud (gh read-only).
El código se entrega como subdirectorio autocontenido listo para extraer con
historia preservada:

```bash
git filter-repo --subdirectory-filter sys-scan-agent
# mover ci/* a .github/workflows/ tras extraer
```

El CI de auditapp no toca el subdirectorio (vitest incluye solo `tests/**`,
tsconfig solo `src|tests`, no hay pnpm-workspace). Verificado.

## Verificación de mapeo Open-AudIT (T10) — ajustes al design

Contrastado contra el schema oficial 6.x (`other/open-audit.sql` del repo
Opmantek/open-audit) y los scripts de audit (`audit_linux.sh`):

| Campo | Design | Verificado | Ajuste |
|---|---|---|---|
| `memoriaMb` | `memory_count` KB→MB | `memory_count` bigint en **KB** | ✓ ÷1024 |
| `discoTotalGb` | discos bytes→GB | `disk.size` int en **MB** | ÷1024 (no bytes) |
| MAC por IP | `network.mac` | colección **`ip`** tiene mac+ip | colección `ip`, fallback `network` |
| `fqdn` | `dns_hostname` | existen `fqdn` y `dns_fqdn` | `dns_fqdn` (fallback `fqdn`) |
| `soArquitectura` | `os_arch` o parse | `os_arch` varchar + `os_bit` tinyint | `os_arch`, fallback `"%d-bit"` |
| `cpuDescripcion` | `processor_description` | colección `processor`, columna `description` | `processor[0].description` |
| `servicios` | puertos OA + host | colección `nmap`: `port/protocol/name/program`, sin `state` | `estadoPuerto:"open"` implícito |
| `instaladoAt` | `installed_on` | datetime MySQL | conversión a RFC3339 |

## Token compuesto (ajuste de implementación, R13)

El token de #60 es opaco (32 bytes base64url) y `GET /api/escaneos/[id]`
exige el id en el path; no hay endpoint de resolución de token. El agente
acepta el token **compuesto** `<escaneoId>:<token>` (documentado en la UI).
Sin tocar #60 (fuera de alcance). Si se quiere token pelado, #60 debería
agregar un endpoint de resolución — queda como mejora futura fuera de #61.

## T15 sin firma (discrepancia tasks.md vs puerta)

`tasks.md` T15 pedía "firmado/notarizado", pero R2 y la puerta 2026-08-27
(posteriores) definen v1 **SIN firma** (distribución interna USB/curl, bypass
documentado). Se implementó R2: CI genera `.exe` NSIS y `.dmg` sin firmar +
SHA-256 + resumen para actualizar `version.json`. La firma queda para v2.

## Trazabilidad R → test

| R | Tests / evidencia |
|---|---|
| R1 (app escritorio ventana propia) | `wails build` verde (binario Linux 17.5 MB); scaffolding Wails v2 + webview nativo; CI builda Windows/macOS (`ci/release.yml`) |
| R2 (instalador único, sin firma v1) | `ci/release.yml` (NSIS + dmg + sha256, sin firma); `build/README.md` con bypass documentado |
| R3 (instalación asistida Docker) | `internal/dockerx/installer_{windows,darwin}.go` + `AvisoDocker.svelte`; test `TestEsperarDaemonTimeout` |
| R4 (deps internas sin intervención) | `nmaphost.InstalarPrerrequisitos` (Npcap/BPF, una sola autorización); `dockerx.InstalarDockerDesktop` |
| R5 (barrido ARP en host) | `nmaphost.TestParsearBarridoXML` (fixture real), `scan.TestFlujoFelizCompleto` (tabla ARP alimenta merge) |
| R6 (merge MAC ARP>OA>IP, divergencia a raw) | `normalize.TestMergeMACPrecedenciaYDivergencia` |
| R7 (modo degradado con advertencia) | `scan.TestModoDegradadoSinCaptura`; `PantallaProgreso.svelte` (aviso persistente) |
| R8 (100% hosts ARP con MAC) | **PRUEBA DE CAMPO PENDIENTE (T17)** — sin LAN en este entorno. Parcial: `normalize.TestSoloARP` + `scan.TestFlujoFelizCompleto` (host solo-ARP entra con MAC) |
| R9 (credenciales solo keyring OS) | `creds.TestGuardarYLeerPorEscaneo`, `TestAislamientoEntreEscaneos` |
| R10 (purga al cerrar) | `creds.TestPurgarEliminaTodoElEscaneo`, `scan.TestPurgaCompletaSinRastroDeCredenciales` (keychain + OA + contenedor) |
| R11 (credenciales nunca a AuditApp/logs) | `logx.TestRedactaCamposSensibles`, `TestRedactaValoresRegistradosEnMensajesLibres`, `scan.TestPurgaCompletaSinRastroDeCredenciales` §4 (fake loguea secretos a propósito y el redactor los limpia) |
| R12 (fail-closed sin almacén) | `creds.TestFailClosedSinAlmacen`; `app.IniciarEscaneo` rechaza con mensaje accionable |
| R13 (validar token antes de iniciar) | `sync.TestObtenerEstadoEnviaHeadersYDevuelveContexto`, `scan.TestFlujoFelizCompleto` (Preparar), integración T16 |
| R14 (consentimiento antes de en_curso) | `scan.TestFlujoFelizCompleto` (orden consentimiento→en_curso), `TestConsentimientoYaOtorgadoNoSeRepite` |
| R15 (en_curso antes de tráfico) | `scan.TestFlujoFelizCompleto` (orden de transiciones verificado) |
| R16 (progreso en vivo) | `scan.ScanProgreso` + polling UI; `esperarFase` en tests verifica fases |
| R17 (sincronizando → drenar → completado) | `scan.TestFlujoFelizCompleto`, `TestSinConectividadNoCompletaYAlVolverDrena` |
| R18 (cola offline + backoff + pausa) | `queue.Test*Backoff/FIFO/Pausa/Reanudación*`; `scan.TestSinConectividad...` |
| R19 (idempotencia reenvío) | `scan.TestSinConectividad...` (server recibe 1 chunk); integración T16 (re-upsert sin duplicar) |
| R20 (multi-VLAN secuencial, 1 activo) | `scan.TestUnSoloEscaneoActivo`, `TestSegundoEscaneoTrasCompletar` |
| R21 (imagen pineada por digest) | `dockerx.TestAsegurarImagen*` (progreso, verificación, error de stream); `docker/sys-openaudit/Dockerfile` (6.0.4 + SHA-256 real) |
| R22 (contenedor efímero, API solo localhost) | `dockerx.TestLevantarContenedorSoloLocalhostYAutoRemove` |
| R23 (configurar discovery vía API) | `openaudit.TestEjecutarDiscoveryCreaYLanza`, `TestCrearCredencialesMapeaTipos` |
| R24 (limpieza huérfanos al arranque) | `dockerx.TestLimpiarHuerfanosSoloSysScan`; `app.Bootstrap` (contenedores + credenciales huérfanas) |
| R25 (validar contra schema, descartar con log) | `normalize.TestValidarRechazaPayloadInvalido`, `TestDescartaSinIP`; auditapp `tests/export-escaneo-schema.test.ts` |
| R26 (clasificación tipo, default desconocido) | `normalize.TestClasificarTipo` (tabla completa, 24 casos) |
| R27 (chunks de 50, raw sin transformación) | `scan.recolectarYEncolar` (TamanoChunk=50); `normalize.TestNormalizaServidorCompleto` (raw intacto) |
| R28 (X-Agente-Version, 409 → detener) | `sync.Test409DeVersionSeClasifica`, `Test429EsRateLimitConVentana`; `scan.drenarUnaVez` (versión → fatal) |
| R29 (aviso nueva versión, sin auto-update) | `update.Test*` (5 tests); `BannerActualizacion.svelte`; auditapp `tests/agente-version-json.test.ts` |
| R30 (versión estampada vía #60) | ldflags en `ci/release.yml` → `buildinfo.Version` → header en cada request (`sync.TestObtenerEstadoEnviaHeaders...`) |
| R31 (es-AR, errores criollos sin stack) | `scan.mensajeCriollo` (mapeo por fase/tipo); UI completa en es-AR |
| R32 (Docker caído a mitad de escaneo) | `scan.TestContenedorMuertoEnMonitoreo` (fallido + purga); `dockerx.TestContenedorVivo` |

## Gates

- **Agente:** `go test ./...` ✓ (10 paquetes) · `go vet` ✓ · `gofmt` ✓ ·
  `-race` en scan/queue ✓ · cross-compile internal windows+darwin ✓ ·
  `wails build` (Linux) ✓ · frontend `svelte-check` 0 errores + build ✓.
- **Auditapp (pieza aditiva):** tests T1/T2 ✓ (15 tests nuevos).
- **Preexistentes en master (NO de esta feature):** 15 tests rotos
  (`informe-manual`, `canonical-contract` snapshot, `report-html-download`),
  7 errores svelte-check en `tests/informe-manual.test.ts`, feature 7 `done`
  sin specs. Verificados con working tree limpio antes de empezar.

## Pendiente (bloqueos del entorno cloud)

- **T17 — Prueba de campo en LAN real (R8):** requiere notebook en LAN real
  con ≥10 dispositivos mixtos. Checklist listo en `tasks.md` T17 y R8:
  (a) 100% hosts de `arp -a` con MAC en AuditApp; (b) ≥1 dispositivo sin
  credenciales con MAC y tipo; (c) corte de Internet a mitad de sync → cola
  drena sin duplicados; (d) post-cierre sin credenciales en
  keychain/contenedor/logs.
- **T16 ejecución:** sin Docker en este entorno; corre en CI
  (`ci/integration.yml`).
- **Extracción del repo** `sys-scan-agent` (ver nota de repo arriba).
- **Digest de imagen:** `dockerx.ImagenDigest` queda vacío hasta que CI
  publique `sys-openaudit:6.0.4-1` en GHCR (el workflow lo imprime).
