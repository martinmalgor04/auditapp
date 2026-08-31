// Package nmaphost ejecuta el barrido ARP con Nmap directo en el HOST (R5):
// el contenedor de Open-AudIT está detrás del NAT de Docker Desktop y su ARP
// no atraviesa a la LAN; el host sí está en el dominio de broadcast.
//
// Sin privilegios de captura (Npcap/BPF) el escaneo sigue en modo degradado
// (R7): MACs solo vía credenciales.
package nmaphost

import (
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

// EntradaARP: fila de la tabla IP→MAC del segmento (+ vendor OUI si Nmap lo
// resolvió).
type EntradaARP struct {
	IP     string
	MAC    string // tal como la reporta Nmap (se normaliza en normalize, #59 R15)
	Vendor string
}

// ErrNmapNoDisponible: no se encontró el binario de Nmap (ni empaquetado ni
// en PATH).
var ErrNmapNoDisponible = errors.New("nmap no está instalado en esta notebook")

// ErrSinCaptura: Nmap está pero no hay acceso raw a la red (Npcap ausente en
// Windows, /dev/bpf sin permisos en macOS). Modo degradado (R7).
var ErrSinCaptura = errors.New("sin acceso de captura de paquetes (Npcap/BPF)")

// ── Parseo del XML de Nmap (-oX) ─────────────────────────────────────────

type nmapRun struct {
	Hosts []nmapHost `xml:"host"`
}

type nmapHost struct {
	Status struct {
		State string `xml:"state,attr"`
	} `xml:"status"`
	Addresses []struct {
		Addr     string `xml:"addr,attr"`
		AddrType string `xml:"addrtype,attr"`
		Vendor   string `xml:"vendor,attr"`
	} `xml:"address"`
}

// ParsearBarridoXML convierte el XML de `nmap -PR -sn -oX -` en la tabla
// IP→MAC. Solo hosts `up` con dirección MAC; los down se ignoran.
func ParsearBarridoXML(data []byte) (map[string]EntradaARP, error) {
	var run nmapRun
	if err := xml.Unmarshal(data, &run); err != nil {
		return nil, fmt.Errorf("interpretar salida de Nmap: %w", err)
	}

	tabla := make(map[string]EntradaARP, len(run.Hosts))
	for _, h := range run.Hosts {
		if h.Status.State != "up" {
			continue
		}
		var ip, mac, vendor string
		for _, a := range h.Addresses {
			switch a.AddrType {
			case "ipv4":
				ip = a.Addr
			case "mac":
				mac = a.Addr
				vendor = a.Vendor
			}
		}
		if ip == "" || mac == "" {
			continue
		}
		tabla[ip] = EntradaARP{IP: ip, MAC: mac, Vendor: vendor}
	}
	return tabla, nil
}

// ── Ejecución del barrido ────────────────────────────────────────────────

// RutaNmap localiza el binario: primero el empaquetado junto al ejecutable
// del agente (Nmap se redistribuye con el agente, NPSL lo permite), luego el
// PATH del sistema.
func RutaNmap(buscarPath func(string) (string, error)) (string, error) {
	nombre := "nmap"
	if runtime.GOOS == "windows" {
		nombre = "nmap.exe"
	}
	if ruta, err := rutaNmapEmpaquetado(nombre); err == nil {
		return ruta, nil
	}
	if ruta, err := buscarPath(nombre); err == nil {
		return ruta, nil
	}
	return "", ErrNmapNoDisponible
}

// BarridoARP ejecuta `nmap -PR -sn <rango> -oX -` en el host y devuelve la
// tabla IP→MAC. El ctx gobierna el timeout (lo fija el orquestador).
func BarridoARP(ctx context.Context, rango string) (map[string]EntradaARP, error) {
	if strings.TrimSpace(rango) == "" {
		return nil, errors.New("rango vacío")
	}
	ruta, err := RutaNmap(exec.LookPath)
	if err != nil {
		return nil, err
	}

	cmd := exec.CommandContext(ctx, ruta, "-PR", "-sn", rango, "-oX", "-")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		detalle := strings.TrimSpace(stderr.String())
		if esErrorDePermisos(detalle) {
			return nil, fmt.Errorf("%w: %s", ErrSinCaptura, detalle)
		}
		return nil, fmt.Errorf("nmap falló: %s", detalle)
	}
	return ParsearBarridoXML(stdout.Bytes())
}

// esErrorDePermisos detecta las salidas típicas de Nmap sin acceso raw.
func esErrorDePermisos(stderr string) bool {
	s := strings.ToLower(stderr)
	return strings.Contains(s, "npcap") ||
		strings.Contains(s, "permission denied") ||
		strings.Contains(s, "operation not permitted") ||
		strings.Contains(s, "/dev/bpf") ||
		strings.Contains(s, "requires root") ||
		strings.Contains(s, "winpcap")
}
