//go:build linux

package dockerx

import (
	"context"
	"errors"
)

// Linux no es plataforma de producto (decisión 2026-08-27). En dev/CI se
// instala Docker Engine por afuera del agente.
func InstalarDockerDesktop(_ context.Context, _ DockerAPI, _ func(int)) error {
	return errors.New("en Linux instalá Docker Engine con tu gestor de paquetes (plataforma no soportada por el agente)")
}
