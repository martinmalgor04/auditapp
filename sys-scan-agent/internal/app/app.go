// Package app cablea las dependencias reales del agente (Docker SDK, keyring
// del OS, SQLite, clientes HTTP) y expone las operaciones que la UI invoca
// vía bindings de Wails. Toda la lógica vive en internal/*; acá solo se
// ensambla y se traducen errores a mensajes en criollo (R31).
package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/serviciosysistemas/sys-scan-agent/internal/buildinfo"
	"github.com/serviciosysistemas/sys-scan-agent/internal/creds"
	"github.com/serviciosysistemas/sys-scan-agent/internal/dockerx"
	"github.com/serviciosysistemas/sys-scan-agent/internal/logx"
	"github.com/serviciosysistemas/sys-scan-agent/internal/normalize"
	"github.com/serviciosysistemas/sys-scan-agent/internal/openaudit"
	"github.com/serviciosysistemas/sys-scan-agent/internal/queue"
	"github.com/serviciosysistemas/sys-scan-agent/internal/scan"
	syncapi "github.com/serviciosysistemas/sys-scan-agent/internal/sync"
	"github.com/serviciosysistemas/sys-scan-agent/internal/update"
)

// BaseURLDefault de AuditApp (producción). Configurable en desarrollo con
// la env var SYS_SCAN_AUDITAPP_URL.
const BaseURLDefault = "https://app.auditoriaserviciosysistemas.com.ar"

// App es la fachada del agente para la UI.
type App struct {
	BaseURL    string
	DataDir    string
	LogDir     string
	Log        *slog.Logger
	LogHandler *logx.Handler

	mu          sync.Mutex
	orq         *scan.Orquestador
	credStore   *creds.Store
	credErr     error // R12: fail-closed se comunica al iniciar
	docker      *dockerx.Client
	dockerErr   error
	cola        *queue.Store
	ultimoToken string // token compuesto validado, para IniciarEscaneo
}

// CredencialDTO es la credencial cargada en la UI (sin persistencia fuera
// del keyring del OS, R9).
type CredencialDTO struct {
	Nombre         string `json:"nombre"`
	Tipo           string `json:"tipo"` // windows | ssh | snmp | snmp_v3
	Usuario        string `json:"usuario,omitempty"`
	Password       string `json:"password,omitempty"`
	Community      string `json:"community,omitempty"`
	AuthProtocol   string `json:"authProtocol,omitempty"`
	AuthPassphrase string `json:"authPassphrase,omitempty"`
	PrivProtocol   string `json:"privProtocol,omitempty"`
	PrivPassphrase string `json:"privPassphrase,omitempty"`
}

// EscaneoInfoDTO es lo que ve el técnico al validar el token (R13).
type EscaneoInfoDTO struct {
	EscaneoID              string `json:"escaneoId"`
	Empresa                string `json:"empresa"`
	Auditoria              string `json:"auditoria"`
	Etiqueta               string `json:"etiqueta"`
	Rango                  string `json:"rango"`
	Estado                 string `json:"estado"`
	ConsentimientoOtorgado bool   `json:"consentimientoOtorgado"`
}

// AvisoVersionDTO para el banner de nueva versión (R29).
type AvisoVersionDTO struct {
	VersionNueva string `json:"versionNueva"`
	URL          string `json:"url"`
}

// Bootstrap crea los directorios de datos, el logger con redacción, la cola
// SQLite y el orquestador con dependencias reales. Degrada con mensajes
// accionables si falta Docker (R3) o el almacén seguro (R12).
func Bootstrap(ctx context.Context) (*App, error) {
	dataDir, err := directorioDatos()
	if err != nil {
		return nil, err
	}
	logDir := filepath.Join(dataDir, "logs")

	logger, handler, logCloser, err := logx.New(logx.Config{Dir: logDir})
	if err != nil {
		return nil, err
	}
	_ = logCloser // vive con el proceso

	baseURL := os.Getenv("SYS_SCAN_AUDITAPP_URL")
	if baseURL == "" {
		baseURL = BaseURLDefault
	}

	cola, err := queue.Open(filepath.Join(dataDir, "cola.db"))
	if err != nil {
		return nil, fmt.Errorf("no se pudo abrir el almacén local del agente: %w", err)
	}

	norm, err := normalize.New(logger)
	if err != nil {
		return nil, err
	}

	a := &App{
		BaseURL:    baseURL,
		DataDir:    dataDir,
		LogDir:     logDir,
		Log:        logger,
		LogHandler: handler,
		cola:       cola,
	}

	// Almacén seguro (R9/R12): si no hay, el agente arranca pero no deja
	// iniciar escaneos (fail-closed con mensaje accionable).
	credStore, err := creds.Open()
	if err != nil {
		a.credErr = err
		logger.Error("almacén seguro no disponible", "error", err)
	} else {
		a.credStore = credStore
	}

	// Docker (R3): si no responde, la UI ofrece la instalación asistida.
	dockerCli, err := dockerx.Nuevo(ctx)
	if err != nil {
		a.dockerErr = err
		logger.Warn("Docker no disponible al arrancar", "error", err)
	} else {
		a.docker = dockerCli
		// Limpieza de huérfanos de ejecuciones anteriores (R24).
		if n, err := dockerCli.LimpiarHuerfanos(ctx); err != nil {
			logger.Warn("limpieza de huérfanos falló", "error", err)
		} else if n > 0 {
			logger.Info("contenedores huérfanos eliminados", "cantidad", n)
		}
		// Purga de credenciales de escaneos ya cerrados (complemento R10).
		if a.credStore != nil {
			a.purgarCredencialesHuerfanas()
		}
	}

	a.orq = scan.Nuevo(scan.Deps{
		NuevoSync: a.nuevoSync,
		Docker:    a.dockerParaScan(),
		NuevoOA: func(cont *dockerx.Contenedor) scan.OpenAuditClient {
			return openaudit.New(cont.BaseURL(), "admin", "password")
		},
		Nmap:         nmapRunner{},
		Normalizador: norm,
		Cola:         cola,
		Creds:        a.credStoreParaScan(),
		Log:          logger,
	})
	return a, nil
}

// purgarCredencialesHuerfanas borra del keychain credenciales de escaneos
// que no tienen fase activa persistida (se cerraron sin purgar, R10/R24).
func (a *App) purgarCredencialesHuerfanas() {
	activos := map[string]bool{}
	if ids, err := a.cola.EscaneosConEstado(); err == nil {
		for _, id := range ids {
			activos[id] = true
		}
	}
	if err := a.credStore.PurgarHuerfanas(activos); err != nil {
		a.Log.Warn("purga de credenciales huérfanas falló", "error", err)
	}
}

// dockerParaScan envuelve el cliente Docker; si no había al arrancar, cada
// llamada reintenta la conexión (el técnico pudo haberlo instalado, R3).
func (a *App) dockerParaScan() scan.DockerClient {
	return &dockerLazy{app: a}
}

func (a *App) credStoreParaScan() scan.CredStore {
	return &credStoreFallible{app: a}
}

// nuevoSync construye el cliente de la API de #60 a partir del token
// compuesto "<escaneoId>:<token>" (ver ParsearTokenEscaneo).
func (a *App) nuevoSync(ctx context.Context, tokenCompuesto string) (scan.SyncClient, *syncapi.EstadoEscaneo, error) {
	escaneoID, token, err := ParsearTokenEscaneo(tokenCompuesto)
	if err != nil {
		return nil, nil, err
	}
	hostname, _ := os.Hostname()
	cli := syncapi.New(a.BaseURL, escaneoID, token, normalizarVersion(buildinfo.Version), hostname)
	estado, err := cli.ObtenerEstado(ctx)
	if err != nil {
		return nil, nil, err
	}
	return cli, estado, nil
}

// normalizarVersion: el server exige semver en X-Agente-Version (#60 R19);
// un build local "dev" reporta 0.0.0-dev para no romper el contrato.
func normalizarVersion(v string) string {
	if v == "" || v == "dev" {
		return "0.0.0-dev"
	}
	return v
}

// ParsearTokenEscaneo acepta el token compuesto "<escaneoId>:<token>".
//
// El token de #60 es opaco (32 bytes base64url) y el GET de estado exige el
// escaneoId en el path; como el server no expone un endpoint de resolución
// de token, el token que se copia de AuditApp viaja compuesto con el id del
// escaneo. Se acepta también el token pelado si el técnico completa el ID
// del escaneo en el campo aparte (la UI lo pide cuando falta).
func ParsearTokenEscaneo(entrada string) (escaneoID, token string, err error) {
	entrada = strings.TrimSpace(entrada)
	if entrada == "" {
		return "", "", errors.New("pegá el token del escaneo")
	}
	if i := strings.Index(entrada, ":"); i > 0 {
		escaneoID = strings.TrimSpace(entrada[:i])
		token = strings.TrimSpace(entrada[i+1:])
		if escaneoID == "" || token == "" {
			return "", "", errors.New("el token compuesto es inválido")
		}
		return escaneoID, token, nil
	}
	return "", "", errors.New("falta el ID del escaneo: pegá el token compuesto que muestra AuditApp (<id>:<token>)")
}

// ── Operaciones para la UI ───────────────────────────────────────────────

// ValidarToken valida el token contra AuditApp y devuelve los datos del
// escaneo para confirmación (R13).
func (a *App) ValidarToken(ctx context.Context, tokenCompuesto string) (*EscaneoInfoDTO, error) {
	estado, err := a.orq.Preparar(ctx, tokenCompuesto)
	if err != nil {
		return nil, err
	}
	escaneoID, _, _ := ParsearTokenEscaneo(tokenCompuesto)
	a.ultimoToken = tokenCompuesto
	dto := &EscaneoInfoDTO{
		EscaneoID:              escaneoID,
		Empresa:                estado.Empresa,
		Auditoria:              estado.Auditoria,
		Rango:                  estado.RangoObjetivo,
		Estado:                 estado.Estado,
		ConsentimientoOtorgado: estado.ConsentimientoOtorgado,
	}
	if estado.Etiqueta != nil {
		dto.Etiqueta = *estado.Etiqueta
	}
	return dto, nil
}

// IniciarEscaneo arranca el escaneo validado (R14/R15). Registra los
// secretos en el redactor de logs (R11) antes de guardarlos en el keyring.
func (a *App) IniciarEscaneo(ctx context.Context, credenciales []CredencialDTO, consentimientoPor string) error {
	if a.credErr != nil {
		return errors.New("esta notebook no tiene almacén seguro disponible; sin eso no se puede escanear (las credenciales del cliente no se guardan en archivos)")
	}
	info, err := a.orq.Preparar(ctx, a.ultimoToken)
	if err != nil {
		return err
	}
	escaneoID, _, _ := ParsearTokenEscaneo(a.ultimoToken)

	lista := make([]creds.Credencial, 0, len(credenciales))
	for _, c := range credenciales {
		lista = append(lista, creds.Credencial{
			Nombre:         c.Nombre,
			Tipo:           creds.TipoCredencial(c.Tipo),
			Usuario:        c.Usuario,
			Password:       c.Password,
			Community:      c.Community,
			AuthProtocol:   c.AuthProtocol,
			AuthPassphrase: c.AuthPassphrase,
			PrivProtocol:   c.PrivProtocol,
			PrivPassphrase: c.PrivPassphrase,
		})
		// R11: que ningún secreto termine en un log, ni por accidente.
		for _, sec := range []string{c.Password, c.Community, c.AuthPassphrase, c.PrivPassphrase} {
			a.LogHandler.RegistrarSecreto(sec)
		}
	}
	_ = info
	return a.orq.Iniciar(ctx, escaneoID, lista, consentimientoPor)
}

// Progreso devuelve el estado en vivo del escaneo (R16).
func (a *App) Progreso() scan.ScanProgreso {
	return a.orq.Estado()
}

// CancelarEscaneo detiene el escaneo activo (purga igual, R10).
func (a *App) CancelarEscaneo(ctx context.Context) error {
	return a.orq.Cancelar(ctx)
}

// ReintentarCola reactiva los envíos pausados (decisión del técnico, R18).
func (a *App) ReintentarCola() error {
	p := a.orq.Estado()
	if p.EscaneoID == "" {
		return errors.New("no hay escaneo activo")
	}
	return a.orq.ReintentarCola(p.EscaneoID)
}

// ChequearActualizacion consulta el version.json de AuditApp (R29).
func (a *App) ChequearActualizacion(ctx context.Context) *AvisoVersionDTO {
	aviso := update.Chequear(ctx, a.BaseURL, buildinfo.Version)
	if aviso == nil {
		return nil
	}
	url := aviso.URLMac
	if esWindows() {
		url = aviso.URLWindows
	}
	return &AvisoVersionDTO{VersionNueva: aviso.VersionNueva, URL: url}
}

// EscaneosReanudables lista escaneos con estado persistido de una ejecución
// anterior (cierre inesperado, R18/R32): la UI ofrece reanudar o descartar.
func (a *App) EscaneosReanudables() ([]string, error) {
	return a.cola.EscaneosConEstado()
}

// DescartarReanudacion limpia el estado persistido de un escaneo viejo.
func (a *App) DescartarReanudacion(escaneoID string) error {
	return a.cola.LimpiarFase(escaneoID)
}

// ExportarLogs junta los logs (ya redactados, R11) en un archivo para
// soporte. Devuelve la ruta del archivo generado.
func (a *App) ExportarLogs(destino string) (string, error) {
	if destino == "" {
		return "", errors.New("elegí dónde guardar el archivo")
	}
	entradas, err := os.ReadDir(a.LogDir)
	if err != nil {
		return "", fmt.Errorf("no hay logs para exportar")
	}
	out, err := os.Create(destino)
	if err != nil {
		return "", fmt.Errorf("no se pudo crear el archivo")
	}
	defer out.Close()
	for _, e := range entradas {
		if e.IsDir() || !strings.HasPrefix(e.Name(), "agente.log") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(a.LogDir, e.Name()))
		if err != nil {
			continue
		}
		fmt.Fprintf(out, "═══ %s ═══\n", e.Name())
		_, _ = out.Write(data)
		_, _ = out.WriteString("\n")
	}
	return destino, nil
}

// EstadoDocker reporta si Docker Desktop está operativo (R3/R32).
func (a *App) EstadoDocker(ctx context.Context) error {
	if a.docker != nil {
		return a.docker.Ping(ctx)
	}
	return a.dockerErr
}

// InstalarDocker guía la instalación asistida de Docker Desktop (R3).
func (a *App) InstalarDocker(ctx context.Context, progresoFn func(int)) error {
	err := dockerx.InstalarDockerDesktop(ctx, nil, progresoFn)
	if err != nil {
		return err
	}
	// Reintentar la conexión tras instalar.
	dockerCli, err := dockerx.Nuevo(ctx)
	if err != nil {
		return err
	}
	a.docker = dockerCli
	a.dockerErr = nil
	return nil
}

// directorioDatos del agente según el OS (design: %APPDATA%/sys-scan-agent
// en Windows, ~/Library/Application Support/sys-scan-agent en macOS).
func directorioDatos() (string, error) {
	if dir, err := directorioDatosOS(); err == nil {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return "", err
		}
		return dir, nil
	}
	// Fallback genérico
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".sys-scan-agent")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return dir, nil
}
