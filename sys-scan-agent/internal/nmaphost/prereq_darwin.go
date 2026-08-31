//go:build darwin

package nmaphost

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Label del daemon launchd que ajusta permisos de BPF (equivalente al
// ChmodBPF de Wireshark): el barrido ARP necesita leer /dev/bpf*.
const (
	bpfDaemonLabel = "ar.com.serviciosysistemas.sysscan.chmodbpf"
	bpfDaemonPlist = "/Library/LaunchDaemons/" + bpfDaemonLabel + ".plist"
	bpfScriptPath  = "/Library/Application Support/sys-scan-agent/chmodbpf.sh"
)

// verificarCaptura en macOS: al menos un /dev/bpf* legible/escribible por el
// usuario actual.
func verificarCaptura(_ context.Context) (bool, string) {
	matches, _ := filepath.Glob("/dev/bpf*")
	for _, m := range matches {
		f, err := os.OpenFile(m, os.O_RDWR, 0)
		if err == nil {
			_ = f.Close()
			return true, ""
		}
	}
	return false, "macOS no le da acceso de captura a esta notebook (permisos BPF). " +
		"El agente instala el permiso una sola vez con tu contraseña de administrador."
}

// plistChmodBPF genera el LaunchDaemon que aplica permisos de BPF en cada
// arranque (grupo staff, rw). Es el mismo enfoque que Wireshark ChmodBPF.
func plistChmodBPF() string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>` + bpfDaemonLabel + `</string>
  <key>ProgramArguments</key>
  <array><string>/bin/sh</string><string>` + bpfScriptPath + `</string></array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`
}

// scriptChmodBPF es el script que el daemon ejecuta al arrancar.
func scriptChmodBPF() string {
	return "#!/bin/sh\n/bin/chmod 0660 /dev/bpf*\n/usr/sbin/chown root:staff /dev/bpf*\n"
}

// InstalarPrerrequisitos instala el daemon de permisos BPF con una sola
// autorización de administrador vía osascript (diálogo nativo de macOS, R4).
func InstalarPrerrequisitos(ctx context.Context) error {
	tmpPlist, err := escribirTemporal("chmodbpf-*.plist", plistChmodBPF())
	if err != nil {
		return err
	}
	tmpScript, err := escribirTemporal("chmodbpf-*.sh", scriptChmodBPF())
	if err != nil {
		return err
	}

	cmdLine := strings.Join([]string{
		"mkdir -p '/Library/Application Support/sys-scan-agent'",
		"cp " + tmpScript + " '" + bpfScriptPath + "'",
		"chmod 755 '" + bpfScriptPath + "'",
		"cp " + tmpPlist + " '" + bpfDaemonPlist + "'",
		"launchctl load '" + bpfDaemonPlist + "'",
		"sh '" + bpfScriptPath + "'",
	}, " && ")

	cmd := exec.CommandContext(ctx, "osascript", "-e",
		`do shell script "`+cmdLine+`" with administrator privileges`)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("no se pudieron instalar los permisos de captura: %w", err)
	}
	return nil
}

func escribirTemporal(patron, contenido string) (string, error) {
	f, err := os.CreateTemp("", patron)
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := f.WriteString(contenido); err != nil {
		return "", err
	}
	return f.Name(), nil
}
