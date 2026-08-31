package nmaphost

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// Disponibilidad del barrido ARP en el host (R5/R7).
type Disponibilidad struct {
	NmapInstalado bool
	CapturaOK     bool
	// Detalle accionable en criollo para la UI (vacío si está todo bien).
	Detalle string
}

// Disponible reporta si el barrido ARP puede correr completo.
func (d Disponibilidad) Disponible() bool {
	return d.NmapInstalado && d.CapturaOK
}

// rutaNmapEmpaquetado busca el Nmap redistribuido junto al ejecutable del
// agente: <dirDelExe>/nmap/nmap[.exe].
func rutaNmapEmpaquetado(nombre string) (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	ruta := filepath.Join(filepath.Dir(exe), "nmap", nombre)
	info, err := os.Stat(ruta)
	if err != nil || info.IsDir() {
		return "", ErrNmapNoDisponible
	}
	return ruta, nil
}

// Verificar detecta si el barrido ARP del host está disponible (R7): Nmap
// presente + prerrequisito de captura del OS (Npcap en Windows, BPF en
// macOS). La parte de captura es específica de cada OS (prereq_<os>.go).
func Verificar(ctx context.Context) Disponibilidad {
	d := Disponibilidad{}

	if _, err := RutaNmap(exec.LookPath); err != nil {
		d.Detalle = "Falta Nmap en esta notebook. Reinstalá el agente o ejecutá la preparación asistida."
		return d
	}
	d.NmapInstalado = true

	ok, detalle := verificarCaptura(ctx)
	d.CapturaOK = ok
	if !ok {
		d.Detalle = detalle
	}
	return d
}

// esWindows/esMac helpers para tests y mensajes.
func esWindows() bool { return runtime.GOOS == "windows" }
func esMac() bool     { return runtime.GOOS == "darwin" }
