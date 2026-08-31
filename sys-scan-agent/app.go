package main

import (
	"context"

	"github.com/serviciosysistemas/sys-scan-agent/internal/app"
	"github.com/serviciosysistemas/sys-scan-agent/internal/buildinfo"
	"github.com/serviciosysistemas/sys-scan-agent/internal/scan"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App es la fachada bound al frontend (Wails). Los métodos exportados se
// exponen como bindings TS en frontend/wailsjs. Delega en internal/app; los
// errores llegan a la UI ya traducidos a criollo (R31).
type App struct {
	ctx  context.Context
	core *app.App
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	core, err := app.Bootstrap(ctx)
	if err != nil {
		// Sin almacén local no hay agente: la UI muestra el error fatal.
		a.core = &app.App{}
		wailsruntime.LogFatalf(ctx, "No se pudo iniciar el agente: %v", err)
		return
	}
	a.core = core
}

func (a *App) shutdown(ctx context.Context) {
	if a.core != nil {
		_ = a.core.CancelarEscaneo(ctx)
	}
}

// Version devuelve el semver del agente (buildinfo, inyectado por ldflags).
func (a *App) Version() string {
	return buildinfo.Version
}

// ValidarToken valida el token compuesto contra AuditApp (R13).
func (a *App) ValidarToken(token string) (*app.EscaneoInfoDTO, error) {
	return a.core.ValidarToken(a.ctx, token)
}

// IniciarEscaneo arranca el escaneo con las credenciales cargadas (R14/R15).
func (a *App) IniciarEscaneo(credenciales []app.CredencialDTO, consentimientoPor string) error {
	return a.core.IniciarEscaneo(a.ctx, credenciales, consentimientoPor)
}

// Progreso devuelve el estado en vivo del escaneo (R16); la UI lo pollea.
func (a *App) Progreso() scan.ScanProgreso {
	return a.core.Progreso()
}

// CancelarEscaneo detiene el escaneo activo (con purga, R10).
func (a *App) CancelarEscaneo() error {
	return a.core.CancelarEscaneo(a.ctx)
}

// ReintentarCola reactiva envíos pausados por falta de conectividad (R18).
func (a *App) ReintentarCola() error {
	return a.core.ReintentarCola()
}

// ChequearActualizacion consulta el version.json de AuditApp (R29).
func (a *App) ChequearActualizacion() *app.AvisoVersionDTO {
	return a.core.ChequearActualizacion(a.ctx)
}

// EscaneosReanudables lista escaneos interrumpidos de ejecuciones previas.
func (a *App) EscaneosReanudables() ([]string, error) {
	return a.core.EscaneosReanudables()
}

// DescartarReanudacion limpia el estado persistido de un escaneo viejo.
func (a *App) DescartarReanudacion(escaneoID string) error {
	return a.core.DescartarReanudacion(escaneoID)
}

// EstadoDocker reporta si Docker Desktop está operativo (R3/R32).
func (a *App) EstadoDocker() error {
	return a.core.EstadoDocker(a.ctx)
}

// InstalarDocker guía la instalación asistida de Docker Desktop (R3).
func (a *App) InstalarDocker() error {
	return a.core.InstalarDocker(a.ctx, nil)
}

// ExportarLogs pide destino con diálogo nativo y exporta los logs ya
// redactados (R11) para soporte.
func (a *App) ExportarLogs() (string, error) {
	destino, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           "Exportar logs del agente",
		DefaultFilename: "sys-scan-logs.txt",
	})
	if err != nil || destino == "" {
		return "", err
	}
	return a.core.ExportarLogs(destino)
}
