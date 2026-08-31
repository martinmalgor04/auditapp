//go:build darwin

package dockerx

import (
	"context"
	"fmt"
	"os/exec"
	"time"
)

// InstalarDockerDesktop guía la instalación asistida única en macOS (R3):
// descarga el dmg oficial (Apple Silicon), lo monta, copia Docker.app y lo
// inicia, esperando a que el daemon responda. Pide contraseña de
// administrador una sola vez (el copiado a /Applications).
func InstalarDockerDesktop(ctx context.Context, api DockerAPI, progreso func(int)) error {
	dmg, err := descargar(ctx, urlDockerDesktopMacARM, "", progreso)
	if err != nil {
		return fmt.Errorf("no se pudo descargar Docker Desktop: %w", err)
	}
	defer limpiarTemporal(dmg)

	pasos := [][]string{
		{"hdiutil", "attach", dmg, "-nobrowse", "-quiet"},
		{"osascript", "-e", `do shell script "cp -R '/Volumes/Docker/Docker.app' /Applications" with administrator privileges`},
		{"hdiutil", "detach", "/Volumes/Docker", "-quiet"},
	}
	for _, args := range pasos {
		if err := exec.CommandContext(ctx, args[0], args[1:]...).Run(); err != nil {
			return fmt.Errorf("instalación de Docker Desktop (%s): %w", args[0], err)
		}
	}

	// Docker.app pide privilegios para su helper la primera vez.
	_ = exec.Command("open", "-a", "Docker").Start()
	return esperarDaemon(ctx, api, 10*time.Minute)
}
