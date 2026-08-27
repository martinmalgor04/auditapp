# Requirements — 61_agente_scan

> Agente `sys-scan-agent`: aplicación de escritorio que corre en la notebook
> del técnico dentro de la LAN del cliente, ejecuta el discovery
> (Nmap en host + Open-AudIT en contenedor), normaliza los resultados al
> contrato de #59 y los sincroniza contra la API de ingesta de #60.
>
> **Decisiones de producto OBLIGATORIAS (humano, 2026-08-27, no reabrir):**
>
> 1. **App de escritorio con VENTANA PROPIA** — no browser en localhost.
>    Stack candidato: Wails (Go + webview nativo del OS + frontend Svelte,
>    mismo stack que AuditApp). La dirección es Wails salvo hallazgo técnico
>    serio; las alternativas se documentan en design.
> 2. **Una sola app instalable**: Docker/Open-AudIT/Nmap son dependencias
>    INTERNAS invisibles. El agente las instala/orquesta/apaga sin
>    interacción del técnico. UI de marca SyS, en español rioplatense, con
>    errores en criollo (sin stack traces).
> 3. **Plataformas: macOS (Apple Silicon) y Windows 10/11.** Open-AudIT NO
>    soporta Windows desktop ni macOS nativo (verificado en docs oficiales
>    2026: solo Windows Server 2016+ y Linux) → corre en contenedor Linux vía
>    Docker Desktop. FirstWave no publica imagen Docker oficial → imagen
>    propia (ver design §Imagen `sys-openaudit`).
> 4. **Segunda ronda de puerta (2026-08-27):** (a) Open-AudIT **Community**
>    (GPL) alcanza — la imagen propia lo redistribuye como agregación
>    (procesos separados, sin linkeo), compatible con GPL; si el volumen o
>    las features comerciales hacen falta, se evalúa Enterprise después.
>    (b) **Sin firma de código en v1** (ver R2). (c) **Repo aparte**
>    `sys-scan-agent` con contrato versionado (JSON Schema exportado de los
>    Zod de #59). (d) Imagen `sys-openaudit` en **GHCR** del org. (e) **Paso
>    UAC/admin único** por notebook aceptado (la preparación la hace SyS, no
>    el técnico en campo). (f) **Sin auto-update en v1** (aviso + descarga
>    manual, R29).

## Contexto verificado

- Contrato de datos: `dispositivoInput` y enums de #59
  (`src/lib/server/escaneos/schemas.ts`); identidad determinística MAC → IP
  (R12 de #59); upsert idempotente por chunk (R13 de #59); `raw` jsonb sin
  transformación (R14 de #59); `fuente` libre (text, default `open-audit`).
- API de sincronización: endpoints y auth por token de #60
  (`specs/60_escaneo_ingesta_api/`): `GET` estado, `POST consentimiento`,
  `POST dispositivos` (chunks de máx. 100), `POST estado`, header
  `X-Agente-Version` con chequeo de major.
- Open-AudIT (docs oficiales, verificadas 2026): soporta Windows Server
  2016+ y Linux (Ubuntu 24.04 entre ellas); **Windows 10/11 no soportados**;
  sin imagen Docker oficial de FirstWave. API JSON REST: `POST /credentials`,
  `POST /discoveries` (type `subnet`), `GET /discoveries/{id}/execute`,
  `GET /devices`. El límite de conexiones TCP salientes incompletas de
  Windows desktop (10/segundo encoladas) es el motivo documentado por
  FirstWave para no soportarlo — Nmap con Npcap (raw sockets) no pasa por
  ese límite.
- Docker Desktop en macOS/Windows corre contenedores Linux en una VM con
  NAT: el tráfico saliente TCP/UDP hacia la LAN funciona, pero **el ARP del
  contenedor no atraviesa el NAT** (la VM está en otro dominio de broadcast).
  El barrido ARP debe correr en el host.
- Wails (2026): v2 es la release estable; v3 está en beta. Binarios ~15 MB,
  webview nativo (WebView2 en Windows, WKWebView en macOS), templates
  Svelte, bindings TS generados.
- Npcap (Windows) se redistribuye solo con licencia OEM → se usa su
  instalador oficial asistido, no se empaqueta. Nmap (NPSL) sí permite
  redistribuir el binario con oferta de fuentes.

## Requisitos

### Plataforma y empaquetado

**R1** — El agente DEBE ejecutarse como aplicación de escritorio con ventana
propia en macOS (Apple Silicon) y Windows 10/11 (x64), sin depender de un
browser del usuario.

**R2** — El agente DEBE distribuirse como un único instalador por
plataforma: `.exe` (NSIS) en Windows y `.app` empaquetada en `.dmg` en
macOS. En v1 los binarios van SIN firma de código (decisión de puerta
2026-08-27): la distribución es interna (USB o descarga vía `curl`, sin
Mark-of-the-Web/quarantine) con instrucciones documentadas para el bypass
puntual de SmartScreen/Gatekeeper. La firma (OV Windows + Apple Developer
ID con notarización) entra en v2.

**R3** — CUANDO el agente detecte que Docker Desktop no está instalado u
operativo, el sistema DEBE guiar al técnico por una instalación asistida
única (descarga del instalador oficial, ejecución y verificación final),
sin que el técnico configure nada manualmente.

**R4** — El agente DEBE instalar, actualizar y remover sus dependencias
internas (imagen `sys-openaudit`, binario de Nmap, prerrequisitos de
captura de paquetes) sin intervención del técnico más allá de la
autorización de privilegios que el OS exija (UAC en Windows, contraseña de
administrador en macOS), una sola vez por notebook.

### Captura de MACs (estrategia ARP/NAT)

**R5** — CUANDO se inicie un escaneo, el agente DEBE ejecutar un barrido ARP
con Nmap corriendo directo en el host (vía helper privilegiado instalado en
R4) para construir la tabla IP→MAC del segmento antes de lanzar el
discovery profundo en el contenedor.

**R6** — El agente DEBE asignar a cada dispositivo la MAC del barrido ARP
del host cuando exista para su IP; en su defecto, la MAC reportada por
Open-AudIT vía credenciales; en su defecto, identidad por IP (R12 de #59).
SI ambas fuentes difieren para una misma IP ENTONCES el agente DEBE conservar
la de Open-AudIT dentro del `raw` para revisión humana (#62).

**R7** — SI el barrido ARP del host no está disponible (sin privilegios,
Npcap ausente, helper no instalado) ENTONCES el agente DEBE continuar el
escaneo en modo degradado (MACs solo vía credenciales) y mostrar una
advertencia persistente en la UI hasta el cierre del escaneo.

**R8** — CUANDO se ejecute la prueba de campo en una LAN real, el agente
DEBE registrar MAC para el 100 % de los hosts que respondan ARP en el
segmento (verificado contra la tabla ARP de la propia notebook, `arp -a`).

### Credenciales de cliente (requisito duro)

**R9** — El agente DEBE almacenar las credenciales del cliente únicamente en
el almacén seguro del OS (Keychain en macOS, Credential Manager/DPAPI en
Windows), con claves namespaced por escaneo.

**R10** — CUANDO un escaneo se cierre (completado, fallido o cancelado por
el técnico), el agente DEBE eliminar las credenciales del almacén del OS,
eliminarlas de la configuración de Open-AudIT vía su API y destruir el
contenedor del escaneo.

**R11** — El agente NO DEBE transmitir credenciales del cliente a AuditApp
ni incluirlas en payloads de sincronización, archivos de log ni telemetría.

**R12** — SI el almacén seguro del OS no está disponible ENTONCES el agente
DEBE rechazar el inicio del escaneo con un mensaje accionable, sin fallback
a archivos en claro ni cifrado con passphrase (fail-closed).

### Flujo de uso

**R13** — CUANDO el técnico pegue un token de escaneo (emitido en #60), el
agente DEBE validarlo contra `GET /api/escaneos/[escaneoId]` antes de
habilitar el inicio, mostrando empresa, auditoría, etiqueta, rango y estado
para confirmación.

**R14** — CUANDO el técnico inicie un escaneo cuyo consentimiento aún no
está registrado, el agente DEBE capturar en la UI quién lo otorga (nombre y
apellido de la persona del cliente) y registrarlo vía
`POST .../consentimiento` antes de transicionar a `en_curso`.

**R15** — CUANDO el técnico inicie el escaneo, el agente DEBE transicionar
el escaneo a `en_curso` vía #60 antes de lanzar cualquier tráfico de
discovery contra la red del cliente.

**R16** — MIENTRAS el discovery corra, el agente DEBE mostrar progreso en
vivo: dispositivos encontrados, dispositivos sincronizados, estado del
escaneo y mensajes de error accionables.

**R17** — CUANDO el discovery termine, el agente DEBE transicionar el
escaneo a `sincronizando`, drenar por completo la cola local y solo entonces
transicionar a `completado`.

**R18** — SI no hay conectividad con AuditApp durante la sincronización
ENTONCES el agente DEBE encolar los chunks localmente (SQLite) y reintentar
con backoff exponencial, sin perder datos ni transicionar a `completado`
hasta drenar la cola.

**R19** — CUANDO el agente reenvíe chunks (reintentos o reanudación tras
cierre inesperado), el resultado en AuditApp DEBE ser idéntico al de un
envío único (idempotencia por upsert de #59, R13).

**R20** — CUANDO el técnico complete un escaneo y la misma auditoría tenga
otro pendiente (multi-VLAN), el agente DEBE permitir iniciar el siguiente
sin reiniciar la aplicación, con un solo escaneo activo a la vez.

### Ciclo de vida del contenedor

**R21** — CUANDO el agente corra por primera vez en una notebook, el sistema
DEBE descargar la imagen `sys-openaudit` pineada por digest (una sola vez,
~1–2 GB), mostrando progreso y verificando el digest antes de usarla.

**R22** — CUANDO se inicie un escaneo, el agente DEBE levantar un contenedor
Linux dedicado y efímero (`--rm`) con Open-AudIT, publicando su API
únicamente en `127.0.0.1` de la notebook.

**R23** — CUANDO se configure el discovery, el agente DEBE cargar las
credenciales en Open-AudIT vía su API, crear el discovery sobre el rango del
escaneo y ejecutarlo, monitoreando su avance hasta el fin.

**R24** — CUANDO el agente arranque, el sistema DEBE detectar y eliminar
contenedores `sys-scan-*` huérfanos de ejecuciones anteriores (limpieza de
cierre inesperado, complemento de R10).

### Normalización y contrato

**R25** — El agente DEBE normalizar cada dispositivo al contrato
`dispositivoInput` de #59 y validarlo contra el JSON Schema exportado de los
schemas Zod antes de encolarlo; SI un dispositivo no valida ENTONCES el
agente DEBE descartarlo, registrar el motivo en su log local (sin
credenciales) y continuar con el resto.

**R26** — El agente DEBE clasificar el `tipo` de cada dispositivo según la
tabla de mapeo del design (Open-AudIT `type` + heurísticas de SO/puertos),
con `desconocido` como default cuando no hay evidencia (R16/R17 de #59:
nunca inventar valores).

**R27** — El agente DEBE enviar los dispositivos en chunks de máximo 50
(el servidor acepta hasta 100, R15 de #60), preservando en `raw` el payload
original de la fuente sin transformación (R14 de #59).

**R28** — El agente DEBE enviar su versión semver en el header
`X-Agente-Version` de cada request; SI AuditApp responde 409 por versión
incompatible ENTONCES el agente DEBE detener el escaneo con un mensaje que
indique actualizar el agente.

### Distribución y versionado

**R29** — CUANDO exista una versión más nueva del agente, el sistema DEBE
avisarlo en la UI con un link de descarga (consultando el `version.json`
publicado en AuditApp al inicio, si hay conectividad), sin auto-actualizar.

**R30** — El agente DEBE estampar su versión en `agente_version` del escaneo
a través del flujo de #60 (R19–R21 de #60), de modo que el registro refleje la
versión que realmente ejecutó el escaneo.

### UI y errores

**R31** — La UI del agente DEBE estar en español rioplatense con la
identidad visual SyS; los mensajes de error DEBEN ser accionables y NO
DEBEN incluir stack traces, salidas crudas de comandos ni datos técnicos
sin traducir.

**R32** — SI Docker Desktop se detiene o el contenedor muere a mitad de un
escaneo ENTONCES el agente DEBE detectarlo, pausar con un mensaje accionable
y ofrecer reintentar o marcar el escaneo como `fallido` con detalle.

## Acceptance

- El agente ejecuta un discovery contra un rango y sincroniza dispositivos
  por chunks con reintentos (acceptance del backlog).
- Las credenciales del cliente no se persisten en AuditApp bajo ningún flujo
  (acceptance del backlog): verificación de artefactos post-cierre (keychain,
  contenedor, logs, cola) sin rastro de credenciales.
- Los datos normalizados cumplen los contratos Zod de #59 (acceptance del
  backlog): validados contra JSON Schema exportado antes de encolar.
- **Prueba de campo obligatoria en LAN real** (R8): 100 % de hosts que
  responden ARP con MAC registrada; al menos un dispositivo sin credenciales
  (impresora o similar) aparece con MAC y tipo clasificado; un corte de
  Internet a mitad de sincronización no pierde datos (cola drena al volver).
- Instalación desde cero en ambas plataformas sin pasos manuales de
  dependencias internas (R3/R4), con `.exe` que pasa la verificación de
  firma y `.app` que pasa `spctl`/`stapler`.

## Diferido / fuera de alcance

| Tema | Destino | Motivo |
|---|---|---|
| Auto-actualización del agente | v2 del agente | v1: aviso + descarga manual versionada (R29); menos superficie de fallo en campo. |
| Escaneos simultáneos (paralelo) | nunca en v1 | La notebook se conecta físicamente a una VLAN por vez (multi-VLAN secuencial, decisión #59). |
| UI de revisión de dispositivos | #62 | El agente solo recolecta y sincroniza. |
| Scoring y diff de inventario | #63/#64 | Consumen el modelo, no al agente. |
| Soporte Linux para la notebook | futura | Plataformas de producto: macOS AS + Windows 10/11 (decisión 2026-08-27). |
| Credenciales guardadas entre escaneos | nunca | Efímeras por escaneo (R9/R10), requisito duro. |

## Material de referencia

- `specs/59_escaneo_modelo_datos/` — modelo, contratos Zod, identidad por
  MAC (R12), decisiones de puerta 2026-08-27 (multi-VLAN consolidada).
- `specs/60_escaneo_ingesta_api/` — endpoints, token de escaneo, rate
  limits, header de versión (contrato de sincronización).
- Documentación oficial verificada 2026: Open-AudIT Server Requirements
  (plataformas soportadas y límite TCP de Windows desktop), The Open-AudIT
  API (collections `credentials`/`discoveries`/`devices`), Wails
  (v2 estable / v3 beta), Npcap (licencia OEM para redistribución).
- `docs/source-specs/`: no existe material previo sobre escaneo de red; la
  saga nace del spec provisto por el usuario en chat (2026-08-27, ver #59).
