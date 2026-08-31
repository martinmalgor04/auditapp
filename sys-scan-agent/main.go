package main

import (
	"embed"

	"github.com/serviciosysistemas/sys-scan-agent/internal/buildinfo"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wailsmac "github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:     "SyS Scan — Agente de escaneo",
		Width:     1024,
		Height:    768,
		MinWidth:  800,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 10, G: 25, B: 41, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
		Mac: &wailsmac.Options{
			About: &wailsmac.AboutInfo{
				Title:   "SyS Scan Agent",
				Message: "Versión " + buildinfo.Version,
			},
		},
	})
	if err != nil {
		println("Error al iniciar el agente:", err.Error())
	}
}
