//go:build windows

package dockerx

import (
	"context"
	"fmt"
	"os/exec"
	"time"
)

// InstalarDockerDesktop guía la instalación asistida única en Windows (R3):
// descarga el instalador oficial, lo ejecuta (dispara UAC) y espera a que el
// daemon responda. El técnico no configura nada manualmente.
func InstalarDockerDesktop(ctx context.Context, api DockerAPI, progreso func(int)) error {
	instalador, err := descargar(ctx, urlDockerDesktopWindows, "", progreso)
	if err != nil {
		return fmt.Errorf("no se pudo descargar Docker Desktop: %w", err)
	}
	defer limpiarTemporal(instalador)

	cmd := exec.CommandContext(ctx, instalador, "install", "--quiet", "--accept-license")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("el instalador de Docker Desktop no completó: %w", err)
	}

	// Arrancar Docker Desktop y esperar el daemon (puede tardar minutos la
	// primera vez: descarga la VM de WSL2).
	_ = exec.Command("cmd", "/c", "start", "", `C:\Program Files\Docker\Docker\Docker Desktop.exe`).Start()
	return esperarDaemon(ctx, api, 10*time.Minute)
}
