# sys-scan-agent

Agente de escritorio de Servicios y Sistemas para escaneo de red en la LAN del
cliente (feature #61 de AuditApp). Corre en la notebook del técnico:
orquesta Nmap (host) + Open-AudIT (contenedor Docker), normaliza al contrato
`dispositivoInput` de #59 y sincroniza contra la API de ingesta de #60.

**Stack:** Wails v2 (Go + webview nativo) · frontend Svelte 5 + Tailwind ·
SQLite (cola offline) · keyring del OS para credenciales efímeras.

> **NOTA DE REPO (temporal):** este directorio se desarrolló como
> subdirectorio autocontenido del repo `auditapp` porque el repo remoto
> `serviciosysistemas/sys-scan-agent` aún no existe. Es un módulo Go
> independiente (sin imports al repo padre, CI propio en
> `.github/` — ver `CI.md`). Para extraerlo preservando la historia:
>
> ```bash
> git clone https://github.com/martinmalgor04/auditapp /tmp/auditapp-extract
> cd /tmp/auditapp-extract
> git filter-repo --subdirectory-filter sys-scan-agent
> git remote set-url origin https://github.com/serviciosysistemas/sys-scan-agent
> git push -u origin master
> ```
>
> (Los archivos de CI del agente viven en `sys-scan-agent/ci/` y se mueven a
> `.github/workflows/` al extraer, para no acoplar el CI de auditapp.)

## Requisitos de desarrollo

- Go 1.24+ y [Wails CLI v2](https://wails.io/docs/gettingstarted/installation)
  (`go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0`)
- Node 22 + pnpm 9
- Docker Desktop (para correr escaneos reales y el test de integración)
- Linux dev: `libwebkit2gtk-4.1-dev` (o `libwebkit2gtk-4.0-dev`) para
  compilar la app de escritorio

## Comandos

```bash
# Tests unitarios (no requieren Docker ni display)
go test ./internal/...

# Build del frontend
cd frontend && pnpm install && pnpm run build

# App de escritorio (dev con hot reload)
wails dev

# Build de producción (binario nativo)
wails build

# Tests de integración (requieren Docker; CI)
go test -tags=integration ./test/integration/...
```

## Estructura

```
main.go, app.go       Wails app + bindings al frontend
frontend/             Svelte 5 + Tailwind (marca SyS, es-AR)
internal/
  app/                ciclo de vida y wiring de bindings
  buildinfo/          versión inyectada por ldflags
  creds/              keyring del OS (credenciales efímeras por escaneo)
  dockerx/            Docker SDK: pull/run/stop/prune del contenedor
  logx/               logger local con redacción de secretos
  nmaphost/           barrido ARP en el host (helper privilegiado)
  normalize/          Open-AudIT/Nmap → dispositivoInput (#59)
  openaudit/          cliente REST de Open-AudIT
  queue/              cola offline SQLite con backoff
  scan/               orquestador del escaneo (máquina de fases)
  sync/               cliente HTTP de la API de ingesta (#60)
  update/             chequeo de nueva versión (version.json de AuditApp)
build/                assets de empaquetado (NSIS / dmg)
ci/                   workflows de GitHub Actions (ver nota de repo arriba)
test/integration/     test end-to-end con Docker (build tag integration)
```

## Contrato con AuditApp

- Schema de dispositivos: AuditApp exporta
  `static/agente/dispositivo-input.schema.json` (script
  `pnpm run export:escaneo-schema` en auditapp). El agente lo vendora en
  `internal/normalize/schema/` y lo contrasta en su test de contrato.
- API de sincronización: endpoints de la feature #60 con token de escaneo y
  header `X-Agente-Version`.
- Aviso de nueva versión: `GET <auditapp>/agente/version.json`.

## Credenciales del cliente (requisito duro)

Viven SOLO en el almacén seguro del OS (Keychain / Credential Manager),
namespaced por escaneo, y se purgan al cerrar el escaneo. NUNCA se envían a
AuditApp ni se escriben en logs (redacción en `internal/logx`).
