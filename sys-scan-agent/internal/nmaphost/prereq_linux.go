//go:build linux

package nmaphost

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// Linux no es plataforma de producto (decisión 2026-08-27: macOS AS +
// Windows 10/11); este archivo existe para desarrollo y CI. La captura raw
// requiere root o CAP_NET_RAW sobre el binario de Nmap.
func verificarCaptura(_ context.Context) (bool, string) {
	ruta, err := RutaNmap(exec.LookPath)
	if err != nil {
		return false, "Nmap no está instalado."
	}
	// getcap sin privilegios alcanza para LEER capabilities.
	out, err := exec.Command("getcap", ruta).Output()
	if err == nil && strings.Contains(string(out), "cap_net_raw") {
		return true, ""
	}
	return false, "Nmap no tiene CAP_NET_RAW (dev/CI: `sudo setcap cap_net_raw,cap_net_admin+eip $(which nmap)`)."
}

// InstalarPrerrequisitos en Linux: setcap sobre el binario (solo dev/CI).
func InstalarPrerrequisitos(ctx context.Context) error {
	ruta, err := RutaNmap(exec.LookPath)
	if err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, "setcap", "cap_net_raw,cap_net_admin+eip", ruta)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("setcap sobre nmap falló: %w", err)
	}
	return nil
}
