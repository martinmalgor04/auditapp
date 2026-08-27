# Design — #61 61_agente_scan

## Alcance

Aplicación de escritorio `sys-scan-agent` (notebook del técnico, LAN del
cliente): orquesta Nmap en host + Open-AudIT en contenedor Docker, normaliza
al contrato de #59 y sincroniza contra la API de #60. **No incluye** UI de
revisión (#62), scoring (#63), diff (#64), ni cambios en la API (#60, ya
especificada).

## Decisiones de diseño (resumen)

1. **Wails v2** (estable; v3 está en beta en 2026 y no se adopta para
   producción). Go para orquestación (Docker SDK first-class, `os/exec`,
   cross-compile maduro) + webview nativo + frontend Svelte 5/Tailwind —
   mismo stack visual que AuditApp. Binario ~15 MB.
2. **Repo aparte** `serviciosysistemas/sys-scan-agent`. El contrato con
   AuditApp es el JSON Schema exportado de los Zod de #59 (script aditivo en
   este repo) + los endpoints de #60. CI, firma y releases independientes.
3. **MACs: barrido ARP con Nmap en el HOST (primario) + MACs por
   credenciales vía Open-AudIT (respaldo), merge por IP.** El contenedor
   está detrás del NAT de Docker Desktop y ARP no lo atraviesa; el host sí
   está en el dominio de broadcast de la LAN. Modo degradado si no hay
   privilegios (R7). Prueba de campo obligatoria (R8).
4. **Credenciales en el almacén del OS** (Keychain / Credential Manager vía
   `99designs/keyring`), namespaced por escaneo, borradas al cerrar (R10).
   Fail-closed si no hay almacén (R12).
5. **Imagen propia `sys-openaudit`**: Ubuntu 24.04 + instalador oficial
   Linux de Open-AudIT (versión y SHA-256 pineados), construida por CI de
   SyS y publicada en GHCR; el agente la referencia por digest (R21).
6. **Cola offline en SQLite** (driver puro Go, sin CGO) con backoff
   exponencial; el cierre a `completado` solo con cola vacía (R17/R18).
7. **Distribución por GitHub Releases**: `.exe` NSIS firmado + `.dmg`
   notarizado; aviso de nueva versión leyendo `static/agente/version.json`
   de AuditApp (archivo estático, sin endpoint nuevo); sin auto-update en
   v1 (R29).

## Arquitectura del agente

```
sys-scan-agent (Wails v2)
├── frontend/                 Svelte 5 + Tailwind (marca SyS, es-AR)
│                             build estático embebido (go:embed)
├── internal/
│   ├── app/                  ciclo de vida Wails, bindings → frontend
│   ├── scan/                 orquestador del escaneo (máquina de fases)
│   ├── nmaphost/             barrido ARP en host vía helper privilegiado
│   ├── dockerx/              Docker SDK: pull, run --rm, logs, stop, prune
│   ├── openaudit/            cliente REST de Open-AudIT (credentials,
│                             discoveries, devices)
│   ├── normalize/            Open-AudIT/Nmap JSON → dispositivoInput (#59)
│   ├── sync/                 cliente HTTP de #60 + X-Agente-Version
│   ├── queue/                SQLite: cola de chunks con backoff
│   ├── creds/                keyring (Keychain / Credential Manager)
│   ├── update/               chequeo de version.json
│   └── logx/                 logger local con redacción de secretos
└── build/                    NSIS (Windows), dmg + entitlements (macOS)
```

Máquina de fases del escaneo (orquestador `scan`):

```
validar_token → consentimiento → en_curso → barrido_arp_host →
levantar_contenedor → configurar_discovery → monitorear →
recolectar_y_normalizar → sincronizando → drenar_cola → completado
                └────────── en cualquier fase: error → fallido ──────────┘
```

Cada fase persiste su avance en SQLite (`scan_state`): si la app se cierra a
mitad de camino, al reabrir ofrece reanudar desde la última fase completa o
marcar `fallido` (R18, R32).

## Estrategia de captura de MACs (riesgo ARP/NAT)

**Problema:** Docker Desktop (macOS/Windows) corre los contenedores en una
VM Linux con NAT. El ARP scan de Nmap dentro del contenedor solo ve la red
interna de la VM: ninguna MAC real de la LAN. Las MACs son la identidad
primaria del modelo (#59 R12) y la clave del dedup multi-VLAN (#62).

**Estrategia primaria (elegida): barrido ARP en el host + merge por IP.**

1. **Fase host (R5):** `nmap -PR -sn <rango> -oX -` ejecutado directo en la
   notebook vía helper privilegiado (ver §Prerrequisitos de captura). ARP
   ping es capa 2 local: descubre todos los hosts vivos del segmento con su
   MAC real, estén o no credenciados. Produce tabla `ip → mac` (+ vendor
   OUI). Además, Nmap con Npcap en Windows usa raw sockets y **no** pasa por
   el límite de 10 conexiones TCP incompletas/segundo de Windows desktop
   (el motivo documentado por FirstWave para no soportar Open-AudIT ahí).
2. **Fase contenedor:** Open-AudIT corre su discovery normal (su Nmap
   interno alcanza la LAN vía NAT para TCP/UDP saliente; WMI/SSH/SNMP
   funcionan saliente). Los dispositivos credenciados reportan sus propias
   MACs (tabla `network` de Open-AudIT).
3. **Merge en normalización (R6):**
   `mac = arpHost[ip] ?? macOpenAudit[ip] ?? null`.
   La ARP del host es la verdad de capa 2 para esa IP en este segmento; la
   de Open-AudIT cubre hosts que no respondieron ARP (p. ej. filtrado) y se
   conserva en `raw` si difiere. Sin ninguna de las dos → identidad por IP
   (R12 de #59, fallback previsto por el modelo).
4. **Modo degradado (R7):** sin helper privilegiado, solo fase contenedor
   (MACs por credenciales). Advertencia persistente en UI: «Escaneo sin
   barrido ARP: los equipos sin credenciales pueden quedar sin MAC».

**Prueba de campo (R8, criterio de aceptación duro):** LAN real (o lab SyS
con ≥10 dispositivos mixtos: servidor, workstations, impresora, switch, AP).
Checklist: (a) 100 % de los hosts de `arp -a` en la notebook tienen MAC en
AuditApp tras el escaneo; (b) al menos un dispositivo sin credenciales
tiene MAC y `tipo` clasificado; (c) corte de Internet a mitad de sync → la
cola drena sola al volver, sin duplicados; (d) post-cierre no quedan
credenciales en keychain, contenedor ni logs.

### Prerrequisitos de captura (privilegios)

ARP scan exige acceso raw a la red en el host:

- **Windows:** Npcap. No se empaqueta (su redistribución exige licencia
  OEM): el agente descarga y ejecuta el instalador oficial una sola vez
  (UAC), con la opción de acceso restringido a Administradores desactivada
  para permitir capturas sin elevar cada proceso (mismo modelo que
  Wireshark). Nmap sí se empaqueta (NPSL lo permite con oferta de fuentes).
- **macOS:** acceso a `/dev/bpf*`. El agente instala una sola vez un daemon
  `launchd` que ajusta permisos de BPF (equivalente al ChmodBPF de
  Wireshark), con autorización del técnico (contraseña de administrador).

Ambos quedan bajo R4 (instalación asistida única). Si el técnico la cancela
→ modo degradado (R7).

## Credenciales de cliente

- **Almacén:** `99designs/keyring` → Keychain (macOS) / Credential Manager
  con DPAPI (Windows). Clave: `sys-scan-agent/<escaneoId>/<nombreCred>`.
- **Carga:** la UI pide las credenciales por escaneo (WMI de Windows, SSH de
  Linux, SNMP v1/v2c community / v3). Nunca hay credenciales «globales».
- **Uso:** se leen del keychain solo para `POST /credentials` de Open-AudIT
  local (R23) y nunca salen del proceso hacia AuditApp (R11).
- **Purga (R10):** al cerrar el escaneo: `DELETE /credentials/{id}` en
  Open-AudIT + `docker stop` (el contenedor es `--rm`: su MariaDB interna se
  destruye) + borrado de las claves del keychain. En el próximo arranque,
  limpieza de huérfanos `sys-scan-*` (R24) y de claves de escaneos ya
  cerrados.
- **Logs:** `logx` redacta cualquier campo `password|community|secret|token`
  antes de escribir (R11). Los logs locales rotan (5 archivos × 5 MB) y se
  ofrecen para soporte con botón «Exportar logs» (ya redactados).
- **Fail-closed (R12):** si el keyring no está disponible, no hay escaneo.

## Ciclo de vida del contenedor

**Imagen `sys-openaudit`** (decisión 5):

```dockerfile
FROM ubuntu:24.04
# Instalador oficial Linux de Open-AudIT, versión y SHA-256 pineados en CI
ARG OAE_VERSION=6.x.x
ARG OAE_SHA256=...
ADD OAE-Linux-x86_64-release_${OAE_VERSION}.run /tmp/
RUN verificar sha256 && ejecutar instalador (incluye Nmap, Apache, PHP, MariaDB)
EXPOSE 80
HEALTHCHECK --interval=5s CMD curl -fsS http://127.0.0.1/open-audit/ || exit 1
```

- CI de SyS (GitHub Actions del repo del agente): build multi-arch
  (`linux/amd64` para Docker Desktop en Windows y Macs con Rosetta —
  ver nota — y `linux/arm64` nativo para Apple Silicon), push a
  `ghcr.io/serviciosysistemas/sys-openaudit:<oaeVersion>-<rev>`.
  Nota: Docker Desktop en Apple Silicon corre contenedores `linux/arm64`
  nativos; la imagen se publica multi-arch y el pull resuelve solo.
- El binario del agente lleva el digest pineado de la imagen compatible con
  su versión (R21): `docker pull sys-openaudit@sha256:...` y verificación
  del digest local antes de `run`. Actualizar la imagen = nueva versión del
  agente (canal de R29).

**Por escaneo (R22/R23):**

```
docker run -d --rm --name sys-scan-<escaneoId8> \
  -p 127.0.0.1:<puertoLibre>:80 sys-openaudit@sha256:<pineado>
```

- Solo localhost (R22): la API de Open-AudIT no se expone a la LAN.
- Red bridge default (NAT): alcanza para el tráfico saliente de discovery
  (WMI/SSH/SNMP/Nmap TCP) hacia la LAN. No se usa `network_mode: host`
  (no existe real en Docker Desktop Mac/Windows) ni MACVLAN (exige
  configuración de red del cliente: inaceptable).
- Configuración vía API REST de Open-AudIT: `POST /credentials` (por cada
  credencial del keychain), `POST /discoveries` (`type: "subnet"`,
  `subnet: <rango del escaneo>`, scan/match options por defecto),
  `GET /discoveries/{id}/execute`, polling de estado/logs,
  `GET /devices?...` paginado con `format=json`.
- **Cierre:** `DELETE /credentials/{id}` × N → `docker stop` (con `--rm` el
  contenedor y su DB interna desaparecen) → purga de keychain (R10).

## Normalización — tabla de mapeo (R25/R26/R27)

Fuente primaria: JSON de `GET /devices` de Open-AudIT (atributos del
device + colecciones asociadas `software`, `network`, `port`/Nmap). Fuente
secundaria: XML del barrido Nmap de host. Los nombres exactos de atributos
se verifican contra la API de la versión pineada en T-area «verificación de
mapeo» (tasks) — la tabla fija la semántica destino.

| Columna #59 | Fuente | Regla |
|---|---|---|
| `ip` | OA `ip` / Nmap `address[addrtype=ipv4]` | directo (schema exige IP válida) |
| `mac` | merge R6: ARP host → OA `network.mac` de la interfaz con esa IP | normaliza `macNormalizada` (12 hex minúsculas) |
| `hostname` | OA `hostname` / Nmap `hostnames[0]` | directo |
| `fqdn` | OA `dns_hostname` | directo |
| `fabricante` | OA `manufacturer`; fallback vendor OUI de Nmap | directo |
| `modelo` | OA `model` | directo |
| `serial` | OA `serial` | directo |
| `tipo` | tabla de clasificación (abajo) | default `desconocido` |
| `so_familia` | OA `os_group` | directo |
| `so_nombre` | OA `os_name` | directo |
| `so_version` | OA `os_version` | directo |
| `so_arquitectura` | OA `os_arch` (o parse de `os_name`) | 32/64 bits si se conoce |
| `cpu_descripcion` | OA `processor_description` (primer procesador) | directo |
| `memoria_mb` | OA `memory_count` | conversión KB→MB según unidad documentada de la versión pineada |
| `disco_total_gb` | suma de discos OA (`hard_disk_*` / colección `disk`) | bytes→GB, entero |
| `visto_at` | timestamp de recolección del agente | `now()` del agente |
| `fuente` | `open-audit` si vino de OA; `nmap` si solo barrido host | provenance real |
| `raw` | JSON completo del device de OA (o del host-result de Nmap) | **sin transformación** (R14 de #59) |
| `software[]` | colección `software` de OA | `nombre`/`version`/`publisher`/`instalado_at`; `raw` = fila OA |
| `servicios[]` | puertos Nmap de OA + puertos del barrido host | `puerto`/`protocolo`/`estado_puerto`/`servicio`/`producto`/`version`/`banner`; `raw` = entrada original |

### Clasificación de `tipo` (R26)

| Evidencia (en orden) | `tipo` |
|---|---|
| OA `type` = `switch`, `router`, `firewall`, `printer`, `camera`, `nas`, `ups` | `switch`, `router`, `firewall`, `impresora`, `camara`, `nas`, `ups` |
| OA `type` = `phone`/`pbx`/`voip` | `telefonia` |
| OA `type` = `mobile`/`tablet`/`smartphone` | `movil` |
| OA `type` = `virtual machine` o `hypervisor` detectado | `virtual` |
| OA `type` = `computer` y `os_name` contiene `Server` | `servidor` |
| OA `type` = `computer` y chassis/form factor laptop | `notebook` |
| OA `type` = `computer` (resto) | `workstation` |
| Solo Nmap: puertos 9100/515/631 abiertos | `impresora` |
| Solo Nmap: puertos 554/8554 (RTSP) | `camara` |
| Solo Nmap: 161/SNMP responde y OUI de fabricante de red | `switch` |
| Sin evidencia suficiente | `desconocido` |

Reglas: nunca promover sin evidencia (R17 de #59: NULL/default, no
sintético); la evidencia usada queda en `raw` para revisión (#62).

## Cola offline (R18/R19)

SQLite en el directorio de datos del OS (`%APPDATA%/sys-scan-agent/` /
`~/Library/Application Support/sys-scan-agent/`), driver
`modernc.org/sqlite` (puro Go: cross-compile sin CGO para firmar desde CI).

```sql
CREATE TABLE IF NOT EXISTS chunk_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  escaneo_id      TEXT NOT NULL,
  endpoint        TEXT NOT NULL,      -- dispositivos | estado | consentimiento
  payload         TEXT NOT NULL,      -- JSON validado (R25)
  intentos        INTEGER NOT NULL DEFAULT 0,
  proximo_intento INTEGER NOT NULL,   -- unix epoch
  created_at      INTEGER NOT NULL
);
```

- Backoff: `30s × 2^intentos`, techo 15 min; a los 20 intentos la cola se
  pausa y la UI pide decisión («Sin internet hace rato. ¿Seguir esperando o
  pausar?») — nunca se descarta solo.
- Drenado FIFO por escaneo; `completado` solo con cola vacía (R17).
- Idempotencia: el upsert del server (R13 de #59) tolera reenvíos (R19).

## Contrato con AuditApp (#60)

- Base URL configurable (default producción), token pegado por el técnico
  (R13). El agente deriva `escaneoId` del propio token resuelto por el
  `GET` (la UI muestra los datos para confirmar).
- Header `X-Agente-Version: <semver>` en todo request (R28); 409 de versión
  → detener con mensaje de actualización.
- Chunks de 50 dispositivos (R27); reintentos con el mismo backoff de la
  cola; 429 del server → respetar y re-encolar con espera de ventana.
- `version.json`: `GET https://<auditapp>/agente/version.json` (archivo
  estático en `static/agente/` de AuditApp, actualizado al publicar cada
  release del agente) → `{ version, urlWindows, urlMac, sha256... }`; si
  `version > propia` → banner con link (R29). Sin endpoint nuevo en #60.

### Pieza aditiva en este repo (auditapp)

| Archivo | Cambio |
|---|---|
| `scripts/export-escaneo-schema.ts` | Genera `dispositivo-input.schema.json` desde los Zod de #59 (`zod-to-json-schema`) para el test de contrato del agente |
| `static/agente/version.json` | Versión vigente del agente + URLs de descarga (se edita al publicar release) |

Ambos son aditivos y no tocan código de aplicación.

## Firmas principales (Go)

```go
type ScanOrchestrator interface {
    Preparar(ctx context.Context, token string) (*EscaneoInfo, error) // R13
    Iniciar(ctx context.Context, creds []Credencial, consent Consentimiento) error // R14/R15
    Estado() ScanProgreso                                             // R16
    Cancelar(ctx context.Context) error
    Cerrar(ctx context.Context, final FinalEscaneo) error             // R10/R17
}

type NmapHostRunner interface {
    BarridoARP(ctx context.Context, rango string) (map[string]string, error) // ip→mac, R5
}

type OpenAuditClient interface {
    EsperarListo(ctx context.Context) error
    CrearCredenciales(ctx context.Context, creds []Credencial) ([]string, error) // R23
    BorrarCredenciales(ctx context.Context, ids []string) error                  // R10
    EjecutarDiscovery(ctx context.Context, rango string) (string, error)         // R23
    EstadoDiscovery(ctx context.Context, id string) (DiscoveryEstado, error)
    Dispositivos(ctx context.Context) ([]OADevice, error)
}

type SyncClient interface {
    ObtenerEstado(ctx context.Context) (*EstadoEscaneo, error)        // #60 GET
    Consentimiento(ctx context.Context, c Consentimiento) error
    EnviarChunk(ctx context.Context, dispositivos []DispositivoInput) error
    Transicion(ctx context.Context, estado string, detalle string) error
}

type QueueStore interface {
    Encolar(endpoint string, payload []byte) error
    Pendientes(escaneoID string) ([]Chunk, error)
    MarcarEnviado(id int64) error
    RegistrarIntento(id int64, proximo time.Time) error
}

type CredStore interface {
    Guardar(escaneoID string, creds []Credencial) error  // R9
    Leer(escaneoID string) ([]Credencial, error)
    Purgar(escaneoID string) error                       // R10
}
```

## Alternativas descartadas

| Alternativa | Por qué se descarta |
|---|---|
| **Browser en localhost** (app web local) | Decisión de producto 2026-08-27: ventana propia. Además: conflictos de puerto, UX «hack», sin control del ciclo de vida de la ventana. |
| **Tauri** | Comparable a Wails (webview nativo + Svelte), pero exige Rust en el equipo (stack SyS: TS/Go-friendly) y el ecosistema de orquestación Docker/procesos es más maduro en Go (Docker SDK oficial). |
| **Electron** | Binario ~150 MB con Chromium embebido, más superficie de actualización y consumo en notebooks de campo; contradice «una sola app liviana». |
| **Fyne / GUI nativa Go** | Sin webview: no reutiliza Svelte/Tailwind ni la identidad SyS de AuditApp; UI de aspecto ajeno. |
| **Wails v3** | En beta en 2026; v2 es la release estable y recibe fixes. Se evalúa migración cuando v3 sea estable. |
| **MACs solo por credenciales** (sin ARP host) | Los dispositivos sin credenciales (impresoras, switches sin SNMP, IoT) quedan sin MAC → identidad por IP → rompe el dedup multi-VLAN (#62) y degrada R12 de #59. Es el **fallback**, no la estrategia. |
| **VM con red bridged** (p. ej. UTM/VirtualBox con Open-AudIT) | Bridged exige tocar la red del cliente (modo puente en el adaptador), peso de una VM completa por notebook y fragilidad de hipervisores third-party en Apple Silicon. Docker Desktop ya está validado como dependencia. |
| **MACVLAN / host networking en Docker Desktop** | No soportado realmente en Docker Desktop Mac/Windows (la VM intermedia lo rompe); MACVLAN además requiere configuración en la red del cliente. |
| **Imagen community de Open-AudIT (Docker Hub)** | Sin imagen oficial de FirstWave; las community son una cadena de suministro no auditada que correría con las credenciales del cliente adentro. Imagen propia desde el instalador oficial, pineada por SHA-256. |
| **Credenciales en archivo cifrado con passphrase** | UX de passphrase por escaneo + riesgo de passphrases débiles/reusadas; el keychain del OS está disponible en el 100 % de las plataformas objetivo (sesión gráfica de escritorio). Fail-closed si falta (R12). |
| **Persistir credenciales entre escaneos del mismo cliente** | Requisito duro: efímeras por escaneo (R9/R10). El costo (recargar por VLAN) es aceptado por el negocio. |
| **Auto-update en v1** (Sparkle/WinSparkle o similar) | Canal de actualización con firma propia es superficie nueva; v1 avisa y linkea la descarga firmada (R29). Se evalúa en v2 del agente. |
| **Cola en archivos JSON por chunk** | SQLite da atomicidad, orden y reanudación transaccional gratis; archivos = fsync manual + corrupción ante cortes. Driver puro Go evita CGO en cross-compile. |
| **Agente como subdirectorio de este repo** | Mezclar toolchain Go/firma binarios con CI de pnpm/SvelteKit acopla ciclos de release y complica secretos de firma. Repo aparte con contrato versionado (JSON Schema exportado). |

## Consumo explícito de R de #59 y #60

| R | Cómo lo consume #61 |
|---|---|
| #59 R12 (identidad MAC→IP) | Merge ARP→credenciales→IP (R6). |
| #59 R13/R18 (upsert, COALESCE) | Reenvíos de cola sin duplicar ni pisar datos (R19). |
| #59 R14 (raw sin transformación) | `raw` = payload original de la fuente (R27). |
| #59 R15 (MAC normalizada) | Normalización antes de validar contra el schema (R25). |
| #59 R16/R17 (tipo, NULLs) | Clasificación con default `desconocido`, sin sintéticos (R26). |
| #59 R2 (`agente_version`) | Header de versión persistido por #60 (R28/R30). |
| #60 R13/R15 (chunk, límites) | Chunks de 50 ≤ 100, body < 2 MB (R27). |
| #60 R16 (transiciones) | Fases del orquestador llaman `POST estado` (R15/R17). |
| #60 R19/R20/R21 (`X-Agente-Version`) | Header en todo request; 409 → detener (R28). |
| #60 R23/R24 (rate limit) | 429 → re-encolar con espera de ventana. |

## Tests

**Unit (CI del repo del agente):**

| Caso | R |
|---|---|
| Normalizador: fixtures JSON reales de Open-AudIT 6.x y XML de Nmap → `dispositivoInput` válido contra JSON Schema exportado | R25, R27 |
| Merge de MACs: precedencia ARP > OA > sin MAC (identidad IP); divergencia conservada en `raw` | R6 |
| Clasificación de `tipo`: tabla completa incluidos defaults `desconocido` | R26 |
| Cola SQLite: orden FIFO, backoff, pausa a los 20 intentos, reanudación tras reinicio del proceso | R18, R19 |
| Redacción de logs: ninguna credencial/token aparece en logs generados | R11 |
| Keyring (mock): guardar/leer/purgar por `escaneoId`; fail-closed sin almacén | R9, R10, R12 |
| Cliente sync: header de versión, manejo de 409/429/500 del server | R28 |
| Orquestador: máquina de fases, reanudación desde `scan_state`, cierre con purga completa | R15, R17, R24, R32 |

**Integración (CI con Docker):** contenedor `sys-openaudit` real + red Docker
de prueba con 2–3 contenedores «víctima» (SSH + SNMP) → discovery end-to-end
contra una instancia de AuditApp de test (API de #60): escaneo completo,
dispositivos persistidos, idempotencia de reenvío. Cubre R22, R23, R13–R19.

**Prueba de campo (obligatoria, manual, checklist en R8):** LAN real,
≥10 dispositivos mixtos, verificación de MACs contra `arp -a`, corte de
Internet a mitad de sync, purga de credenciales post-cierre. Cubre R5–R8,
R10, R18. Se documenta en `progress/impl_61_agente_scan.md` con evidencia.

## Preguntas abiertas para la puerta humana

1. **Licencia de Open-AudIT:** ¿la edición Community alcanza para el volumen
   de dispositivos de los clientes SyS? ¿La redistribución del instalador
   oficial dentro de la imagen `sys-openaudit` es compatible con su
   licencia? ¿Hace falta Professional/Enterprise?
2. **Certificados de firma:** ¿SyS compra certificado OV/EV de code-signing
   Windows (sin EV, SmartScreen advierte las primeras instalaciones) y
   cuenta Apple Developer (notarización)?
3. **Repo aparte** `sys-scan-agent` vs subdirectorio en auditapp (este spec
   propone repo aparte).
4. **GHCR del org** para publicar `sys-openaudit`: ¿existe/habilitar?
5. **Paso UAC/admin único** por notebook (Npcap / daemon BPF): ¿aceptable
   como parte de la preparación de las notebooks de técnicos?
6. **Auto-update diferido a v2** del agente: ¿confirmado?

## Gates

Repo del agente: `go test ./...` · build Windows/macOS firmados en CI ·
integración con contenedor real · prueba de campo documentada.
Repo auditapp (pieza aditiva): `pnpm run check` · `pnpm test` · `./init.sh`.
