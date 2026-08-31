package nmaphost

import (
	"errors"
	"os"
	"testing"
)

func TestParsearBarridoXML(t *testing.T) {
	data, err := os.ReadFile("testdata/nmap-arp.xml")
	if err != nil {
		t.Fatalf("leer fixture: %v", err)
	}

	tabla, err := ParsearBarridoXML(data)
	if err != nil {
		t.Fatalf("ParsearBarridoXML: %v", err)
	}

	if len(tabla) != 3 {
		t.Fatalf("esperaba 3 hosts up con MAC, hay %d", len(tabla))
	}

	gw := tabla["192.168.10.1"]
	if gw.MAC != "AA:BB:CC:00:11:22" || gw.Vendor != "Ubiquiti" {
		t.Fatalf("gateway mal parseado: %+v", gw)
	}

	// MAC en minúsculas y vendor ausente también se capturan
	pi := tabla["192.168.10.15"]
	if pi.MAC != "b8:27:eb:aa:bb:cc" || pi.Vendor != "Raspberry Pi Trading" {
		t.Fatalf("raspi mal parseada: %+v", pi)
	}
	sin := tabla["192.168.10.20"]
	if sin.Vendor != "" {
		t.Fatalf("vendor ausente debería quedar vacío: %+v", sin)
	}

	// Host down: no entra a la tabla
	if _, ok := tabla["192.168.10.99"]; ok {
		t.Fatalf("un host down no debería aparecer")
	}
}

func TestParsearBarridoXMLInvalido(t *testing.T) {
	if _, err := ParsearBarridoXML([]byte("esto no es XML")); err == nil {
		t.Fatalf("XML inválido debería fallar")
	}
}

func TestEsErrorDePermisos(t *testing.T) {
	casos := map[string]bool{
		"Npcap is not installed":                      true,
		"could not open /dev/bpf0: Permission denied": true,
		"raw socket: Operation not permitted":         true,
		"requires root privileges":                    true,
		"WinPcap is required":                         true,
		"host seems down":                             false,
		"":                                            false,
	}
	for entrada, esperado := range casos {
		if got := esErrorDePermisos(entrada); got != esperado {
			t.Fatalf("esErrorDePermisos(%q) = %v, esperado %v", entrada, got, esperado)
		}
	}
}

func TestRutaNmapNoDisponible(t *testing.T) {
	_, err := RutaNmap(func(string) (string, error) {
		return "", errors.New("no está en PATH")
	})
	if !errors.Is(err, ErrNmapNoDisponible) {
		t.Fatalf("esperaba ErrNmapNoDisponible, vino %v", err)
	}
}

func TestBarridoARPRangoVacio(t *testing.T) {
	if _, err := BarridoARP(t.Context(), "  "); err == nil {
		t.Fatalf("rango vacío debería fallar")
	}
}
