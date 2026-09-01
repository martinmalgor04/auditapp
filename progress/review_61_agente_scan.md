# Review — feature 61 `61_agente_scan`

**Veredicto:** APROBADO (con condición de cierre: T17 prueba de campo pendiente — ver abajo)

- Rama revisada: `cursor/61-agente-scan-78c2` (commit `40b0a15`).
- Spec: `specs/61_agente_scan/` (requirements EARS + design + tasks), puerta
  humana 2026-08-27 sellada en dos rondas; implementación autorizada por
  instrucción directa del usuario (2026-08-31).
- Reviewer: sesión 2026-09-01, VM cloud (Go 1.25.0 vía toolchain, Node 22,
  Postgres 16 vía apt, sin Docker ni LAN física).
- Toda gate fue corrida por el reviewer con el árbol quieto.

## Blockers

Ninguno en el código. **Condición de cierre (no de código):** la feature NO
debe marcarse `done` mientras T17 (prueba de campo en LAN real, R8) siga
abierta — C6 exige todas las tasks `[x]` para el `done`. T17 es
in ejecutable desde cualquier entorno cloud (exige notebook en LAN física);
queda como tarea de campo para el humano con checklist listo en
`tasks.md` T17 y `progress/impl_61_agente_scan.md` §Pendiente.

## Cobertura de trazabilidad: 32/32 (31 automatizados + R8 campo)

Verificado por lectura directa de los archivos de test: 72 tests unitarios Go
en 10 paquetes + 1 de integración (build tag) + 15 tests TS nuevos en
auditapp. Todos los tests nombrados en el mapa del implementer existen y
pasan (corridos por el reviewer).

| R | Test(s) / evidencia |
|---|---|
| R1 | Scaffolding Wails v2 + webview nativo (`wails.json`, `main.go`, `app.go`); cross-compile `GOOS=windows/amd64` ✓ y `GOOS=darwin/arm64` ✓ (corridos en esta VM); CI builda ambas plataformas (`ci/release.yml`) |
| R2 | `ci/release.yml` (NSIS + dmg + SHA-256, **sin firma** = R2/puerta 2026-08-27); ldflags inyecta semver |
| R3 | `internal/dockerx/installer_{windows,darwin}.go` + `AvisoDocker.svelte`; `dockerx.TestEsperarDaemonTimeout` |
| R4 | `nmaphost.InstalarPrerrequisitos` (Npcap/BPF, autorización única); `dockerx.InstalarDockerDesktop` |
| R5 | `nmaphost.TestParsearBarridoXML` (fixture real) + `TestParsearBarridoXMLInvalido`; `scan.TestFlujoFelizCompleto` |
| R6 | `normalize.TestMergeMACPrecedenciaYDivergencia` (ARP > OA > IP, divergencia a `raw`) |
| R7 | `scan.TestModoDegradadoSinCaptura`; advertencia persistente en `PantallaProgreso.svelte` (texto idéntico al design) |
| R8 | **PRUEBA DE CAMPO PENDIENTE (T17)** — sin LAN en cloud. Parcial automatizado: `normalize.TestSoloARP` + `scan.TestFlujoFelizCompleto` (host solo-ARP entra con MAC); `scan.recolectarYEncolar` incluye hosts ARP-no-OA (línea 513) |
| R9 | `creds.TestGuardarYLeerPorEscaneo`, `TestAislamientoEntreEscaneos` (keyring OS, namespace por escaneo) |
| R10 | `creds.TestPurgarEliminaTodoElEscaneo`, `scan.TestPurgaCompletaSinRastroDeCredenciales` (keychain + OA + contenedor) |
| R11 | Estructural: `internal/sync/sync.go` tiene **cero** referencias a credenciales (grep verificado); `logx.TestRedactaCamposSensibles`, `TestRedactaValoresRegistradosEnMensajesLibres` |
| R12 | `creds.TestFailClosedSinAlmacen` (`ErrAlmacenNoDisponible`, sin fallback a archivos) |
| R13 | `sync.TestObtenerEstadoEnviaHeadersYDevuelveContexto`; `scan.TestFlujoFelizCompleto` (Preparar); integración T16 |
| R14 | `scan.TestFlujoFelizCompleto` (orden consentimiento→en_curso) + `TestConsentimientoYaOtorgadoNoSeRepite` |
| R15 | `scan.TestFlujoFelizCompleto`: `en_curso` antes de cualquier tráfico (verificado en código, `scan.go:340`) |
| R16 | `scan.ScanProgreso` + polling UI; fases verificadas en tests del orquestador |
| R17 | `scan.TestFlujoFelizCompleto`, `TestSinConectividadNoCompletaYAlVolverDrena` (sincronizando→drenar→completado) |
| R18 | `queue.TestBackoffExponencialConTecho`, `TestEncolarYPendientesFIFO`, `TestPausaALos20IntentosYReanudar`, `TestReanudacionTrasReinicioDelProceso` |
| R19 | `scan.TestSinConectividadNoCompletaYAlVolverDrena`; stub de integración con upsert por identidad MAC→IP fiel a #59 R12 |
| R20 | `scan.TestUnSoloEscaneoActivo`, `TestSegundoEscaneoTrasCompletar` |
| R21 | `dockerx.TestAsegurarImagen{YaLocalSinDigestPineado,ReportaProgreso,FallaConErrorDeStream}`; `Dockerfile` pinea OAE 6.0.4 + SHA-256 con `sha256sum -c` |
| R22 | `dockerx.TestLevantarContenedorSoloLocalhostYAutoRemove` (`--rm`, bind solo `127.0.0.1`) |
| R23 | `openaudit.TestEjecutarDiscoveryCreaYLanza`, `TestCrearCredencialesMapeaTipos`, `TestDispositivosPaginadoYRaw` |
| R24 | `dockerx.TestLimpiarHuerfanosSoloSysScan`; `app.Bootstrap` (contenedores + credenciales huérfanas, `app.go:140,175`) |
| R25 | `normalize.TestValidarRechazaPayloadInvalido`, `TestDescartaSinIP`; auditapp `tests/export-escaneo-schema.test.ts` (12 tests, AJV contra el schema exportado) |
| R26 | `normalize.TestClasificarTipo` (tabla completa) + `TestSinClasificarConPuertosUsaHeuristica`; default `desconocido` |
| R27 | `scan.TamanoChunk = 50` (`scan.go:49`); `normalize.TestNormalizaServidorCompleto` (raw intacto) |
| R28 | `sync.Test409DeVersionSeClasifica`, `Test429EsRateLimitConVentana`; header en todo request (`sync.go:116`) |
| R29 | `update.Test*` ×5 (semver, sin conectividad no falla); `BannerActualizacion.svelte`; auditapp `tests/agente-version-json.test.ts` (3 tests) |
| R30 | ldflags → `buildinfo.Version` → header (`ci/release.yml:34,68`; `sync.TestObtenerEstadoEnviaHeaders...`) |
| R31 | UI completa es-AR con voseo («Si no lo tenés instalado», verificado); `scan.mensajeCriollo` por fase; sin stack traces |
| R32 | `scan.TestContenedorMuertoEnMonitoreo` (fallido + purga); `dockerx.TestContenedorVivo` |

## Tasks

- T1–T16, T18: `[x]` en `specs/61_agente_scan/tasks.md` (verificado por
  lectura directa).
- **T17: `[ ]` JUSTIFICADA** — prueba de campo en LAN real (R8), bloqueada
  por entorno (no ejecutable desde cloud; exige hardware físico). Checklist
  listo. No es un `[ ]` sin justificación → no fuerza rechazo según el
  protocolo, pero **bloquea el `done`** (ver condición de cierre).
- T15 (discrepancia spec): la task decía "firmado/notarizado" pero R2 y la
  puerta 2026-08-27 (posteriores y superiores en jerarquía) definen v1 SIN
  firma. El implementer siguió R2 y lo asentó en `tasks.md`. **Correcto.**

## Puntos críticos (resultado uno por uno)

1. **Máquina de fases (R13→R14→R15→…→R17)** — ✓ Conforme, leída en
   `scan.go:290-456`: keyring → consentimiento → `en_curso` ANTES de tráfico
   → ARP host (degradado si no) → imagen/contenedor → discovery → monitoreo
   → recolecta/normaliza/encola → `sincronizando` → drenar → `completado`;
   error en cualquier fase → `fallido`/`cancelado` + purga. Idéntica al
   design.
2. **Credenciales (requisito duro R9–R12)** — ✓ Conforme. `creds.go`:
   solo keyring del OS, claves `sys-scan-agent/<escaneoId>/<nombre>`,
   fail-closed con error tipado, purga idempotente + huérfanas. Las
   credenciales van SOLO al contenedor local (`oaCli.CrearCredenciales`) —
   `sync.go` no las conoce (grep). `logx` redacta claves sensibles y valores
   literales registrados.
3. **Estrategia ARP/NAT (R5–R7)** — ✓ Conforme al design: barrido
   `nmap -PR -sn` en host, merge por IP con precedencia ARP > OA > identidad
   IP, divergencia conservada en `raw`, modo degradado con advertencia
   persistente (texto del design).
4. **Contrato #59/#60** — ✓ Conforme. JSON Schema draft-07 autocontenido
   exportado de los Zod (MAC pattern inyectado porque el transform no es
   representable — documentado); re-ejecutar `pnpm run export:escaneo-schema`
   produce **cero diff** (verificado). Chunks de 50 ≤ 100; `X-Agente-Version`
   + Bearer en todo request; 409 versión vs conflicto de fase distinguidos;
   429 con ventana.
5. **Contenedor (R21/R22/R24)** — ✓ Conforme: imagen pineada (versión +
   SHA-256 real de FirstWave, verificación `sha256sum -c` en Dockerfile),
   `run --rm` con API solo en `127.0.0.1`, limpieza de huérfanos `sys-scan-*`
   al arranque.
6. **Pieza auditapp (T1/T2)** — ✓ Aditiva pura: script + 2 archivos
   estáticos + 2 tests. **Cero archivos existentes tocados** en `src/`,
   `tests/`, `migrations/`, `e2e/` (diff name-only verificado).
7. **Verificación de mapeo OA 6.x (T10)** — ✓ El implementer contrastó
   contra el schema oficial y ajustó 8 campos del design (memoria KB→MB,
   disco MB→GB, colección `ip` para MAC, `dns_fqdn`, etc.), documentado en
   el impl con tabla. Es exactamente lo que T10 pedía.

## Desviaciones declaradas (evaluación)

1. **Agente como subdirectorio `sys-scan-agent/` en vez de repo aparte —
   ACEPTADA.** La puerta (decisión 4c) y el design exigen repo
   `serviciosysistemas/sys-scan-agent`, que no existe y el implementer no
   podía crear (gh read-only). El módulo es autocontenido: `go.mod` propio
   (`github.com/serviciosysistemas/sys-scan-agent`), **cero imports al repo
   padre** (verificado), CI propio en `ci/` listo para mover a
   `.github/workflows/`, y el tooling de auditapp lo ignora (vitest incluye
   solo `tests/**`; sin `pnpm-workspace.yaml`; sin referencias en configs —
   todo verificado). Extracción documentada (`git filter-repo
   --subdirectory-filter`). Queda **pendiente para el humano**: crear el
   repo y extraer. Riesgo residual bajo: el CI de auditapp no toca el
   subdirectorio y `init.sh` se comporta idéntico a master (abajo).
2. **Token compuesto `<escaneoId>:<token>` (R13) — ACEPTADA.** El token de
   #60 es opaco y `GET /api/escaneos/[id]` exige el id en el path; no hay
   endpoint de resolución. El agente documenta el formato en la UI. No toca
   #60 (fuera de alcance). Mejora futura sugerida: endpoint de resolución
   en #60.
3. **T15 sin firma — ACEPTADA** (ver Tasks arriba): la puerta manda sobre
   el texto viejo de la task.

## Evidencia de gates (corridos por el reviewer en esta VM)

| Gate | Resultado | Detalle |
|---|---|---|
| `go test ./...` (agente) | **✓ 10 paquetes ok** | 72 tests unitarios; integración excluida por build tag |
| `go vet ./...` + `gofmt -l` | **✓ limpio** | — |
| `go test -race` scan + queue | **✓ verde** | — |
| Cross-compile `windows/amd64` + `darwin/arm64` | **✓ ambos** | `go build ./...` |
| Frontend agente: `svelte-check` | **✓ 0 errores, 0 warnings** | tras `pnpm install` del lockfile propio |
| Frontend agente: `vite build` | **✓ verde** | — |
| Tests nuevos auditapp | **✓ 15/15** | `export-escaneo-schema` (12) + `agente-version-json` (3) |
| Re-export del schema (T1) | **✓ cero diff** | reproducible desde los Zod |
| `pnpm test` completo (rama, con build) | **1614 passed / 14 failed / 2 skipped (1630)** | 1614 = 1599 (master) + 15 nuevos, exacto |
| Baseline master (worktree limpio, misma VM) | **1599 passed / 14 failed / 2 skipped (1615)** | diff de nombres de tests fallidos rama vs master: **idénticos** (14/14) → **cero fallas nuevas** |
| `pnpm run check` (rama) | **7 errores, todos en `tests/informe-manual.test.ts`** | archivo no tocado por la rama = baseline de master |
| `pnpm run build` | **✓ verde** | adapter-node |
| `./init.sh` | **rojo solo por baseline preexistente** | sección 3: feature 7 `done`+`sdd` sin `specs/07_form_tecnico/` (idéntico en master, verificado en worktree); sección 4: las 14 fallas baseline de arriba. Secciones 1–2 verdes. Mismo criterio que las reviews aprobadas de #60 y #62 |
| Integración T16 | **no corre en esta VM (sin Docker)** | implementada con build tag `integration` + stub fiel al contrato #60; corre en `ci/integration.yml`. Compila verde |
| Prueba de campo T17 | **pendiente (bloqueo de entorno)** | checklist listo; requiere LAN física |

## Checkpoints

- **C1** — Arnés completo ✓. `./init.sh` no termina en 0 por causas
  preexistentes de master (feature 7 sin spec + 14 fallas baseline),
  verificado en worktree master limpio de esta misma VM con nombres de
  tests fallidos idénticos. **No introducido por #61.**
- **C2** — ✓ Una sola feature `in_progress` (la 61); `feature_list.json`
  válido (64 features); `progress/current.md` describe la sesión del
  implementer (el cierre corresponde al leader tras este review).
- **C3** — ✓ La pieza auditapp no toca SQL ni migraciones; el agente es Go
  autocontenido (SQLite vía modernc, sin CGO). Sin `console.log` de debug
  ni TODOs sin contexto en el código nuevo (grep; el `console.log` final
  del script de export es salida CLI legítima). Sin secretos en código ni
  archivos sensibles en el diff (grep `.env|.key|.pem|secret`). `.gitignore`
  del agente cubre binarios/datos/logs; `frontend/dist` solo placeholder
  documentado.
- **C4** — ✓ 87 tests nuevos verdes (72 Go unit + 15 TS) + 1 integración
  lista para CI; trazabilidad 31/32 automatizada + R8 de campo. E2E
  playwright no aplica: la pieza auditapp no tiene flujo de UI y el agente
  es app de escritorio (su end-to-end es T16 en CI con Docker).
- **C5** — ✓ Árbol limpio (`git status` vacío tras todas las gates);
  entrada en `progress/history.md` corresponde al leader al cerrar
  (precedente #62).
- **C6** — Parcial: spec EARS completo ✓; cada R con test ✓ (R8 = prueba de
  campo); tasks T1–T16+T18 `[x]` ✓; **T17 `[ ]` justificada → la feature no
  puede pasar a `done` hasta ejecutarla** (condición de cierre declarada).

## Observaciones menores (no bloquean)

1. `sys-scan-agent/README.md:15` referencia `CI.md`, que no existe (el CI
   vive en `ci/` y el propio README lo explica dos líneas después). Cosmético.
2. `specs/61_agente_scan/requirements.md` §Acceptance quedó con texto viejo
   («.exe que pasa la verificación de firma y .app que pasa spctl/stapler»)
   que contradice R2 y la puerta 2026-08-27 (v1 sin firma). Deuda del spec,
   no de la implementación — conviene corregirlo al cerrar.
3. `progress/current.md` tiene la sección Plan con checkboxes `[ ]` sin
   marcar (la sección Estado sí está actualizada; el tracker canónico es
   `tasks.md`, correctamente marcado). Lo limpia el leader al cerrar.
4. `dockerx.ImagenDigest` vacío hasta que CI publique `sys-openaudit:6.0.4-1`
   en GHCR (el workflow lo imprime) — secuencia prevista por el design.

## Recomendación al leader

Mergear `cursor/61-agente-scan-78c2` y **mantener #61 `in_progress`** (no
`done`) con T17 como único ítem abierto, o bien split de T17 a una tarea de
campo explícita; en ambos casos C6 queda protegido. Pendientes humanos
registrados en el impl: (a) ejecutar T17 en LAN real con el checklist;
(b) crear `serviciosysistemas/sys-scan-agent` y extraer el subdirectorio
con `git filter-repo`; (c) publicar la imagen en GHCR y pineara el digest.
La baseline roja de master (14 tests + feature 7 sin spec) sigue siendo
deuda preexistente — ya candidata a feature de saneamiento en reviews #60/#62.
