//go:build windows

package nmaphost

import (
	"context"
	"fmt"
	"os/exec"
)

// Versión de Npcap pineada (su redistribución exige licencia OEM: se usa el
// instalador oficial descargado en el momento, no se empaqueta — R4/design).
const (
	NpcapVersion = "1.83"
	NpcapURL     = "https://npcap.com/dist/npcap-" + NpcapVersion + ".exe"
	// SHA-256 del instalador oficial npcap-1.83.exe (verificar al actualizar).
	NpcapSHA256 = ""
)

// verificarCaptura en Windows: el driver/servicio Npcap debe existir.
func verificarCaptura(ctx context.Context) (bool, string) {
	cmd := exec.CommandContext(ctx, "sc", "query", "npcap")
	if err := cmd.Run(); err != nil {
		return false, "Falta Npcap (el motor de captura de Nmap para Windows). " +
			"El agente te guía para instalarlo una sola vez."
	}
	return true, ""
}

// argsInstaladorNpcap son los flags del instalador oficial: silencioso, sin
// restringir la captura a Administradores (mismo modelo que Wireshark, para
// no elevar cada proceso), sin soporte loopback (no lo usa el barrido ARP).
func argsInstaladorNpcap() []string {
	return []string{"/S", "/admin_only=no", "/loopback_support=no"}
}

// InstalarPrerrequisitos descarga el instalador oficial de Npcap y lo ejecuta
// (dispara UAC una sola vez, R4). La descarga se verifica por SHA-256 cuando
// está pineado.
func InstalarPrerrequisitos(ctx context.Context, descargar func(ctx context.Context, url, sha256 string) (string, error)) error {
	instalador, err := descargar(ctx, NpcapURL, NpcapSHA256)
	if err != nil {
		return fmt.Errorf("no se pudo descargar el instalador de Npcap: %w", err)
	}
	cmd := exec.CommandContext(ctx, instalador, argsInstaladorNpcap()...)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("el instalador de Npcap no completó: %w", err)
	}
	return nil
}
