package normalize

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/serviciosysistemas/sys-scan-agent/internal/nmaphost"
	"github.com/serviciosysistemas/sys-scan-agent/internal/openaudit"
)

func nuevoNormalizador(t *testing.T) *Normalizador {
	t.Helper()
	n, err := New(slog.New(slog.NewJSONHandler(io.Discard, nil)))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return n
}

func cargarDevice(t *testing.T, path string) openaudit.OADevice {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("leer fixture: %v", err)
	}
	var crudo struct {
		ID         string                      `json:"id"`
		Attributes map[string]any              `json:"attributes"`
		Included   map[string][]map[string]any `json:"included"`
	}
	if err := json.Unmarshal(data, &crudo); err != nil {
		t.Fatalf("parsear fixture: %v", err)
	}
	var raw map[string]any
	_ = json.Unmarshal(data, &raw)
	return openaudit.OADevice{
		ID:         crudo.ID,
		Attributes: crudo.Attributes,
		Included:   crudo.Included,
		Raw:        raw,
	}
}

var visto = time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)

func TestNormalizaServidorCompleto(t *testing.T) {
	n := nuevoNormalizador(t)
	d := cargarDevice(t, "testdata/oa-device-servidor.json")

	disp, err := n.DesdeOpenAudit(d, nil, visto)
	if err != nil {
		t.Fatalf("DesdeOpenAudit: %v", err)
	}

	if disp.IP != "192.168.10.10" {
		t.Fatalf("ip: %s", disp.IP)
	}
	if disp.Mac == nil || *disp.Mac != "aabbccddee01" {
		t.Fatalf("mac debería venir de OA normalizada: %v", disp.Mac)
	}
	if *disp.Hostname != "SRV-DC01" {
		t.Fatalf("hostname: %v", *disp.Hostname)
	}
	if *disp.Fqdn != "srv-dc01.acme.local" {
		t.Fatalf("fqdn debería preferir dns_fqdn: %v", *disp.Fqdn)
	}
	if *disp.Fabricante != "Dell Inc." || *disp.Modelo != "PowerEdge R450" || *disp.Serial != "ABC1234" {
		t.Fatalf("hardware mal mapeado: %+v", disp)
	}
	// computer + os_name con "Server" → servidor
	if disp.Tipo != "servidor" {
		t.Fatalf("tipo: %s", disp.Tipo)
	}
	if *disp.SoFamilia != "Windows" || *disp.SoNombre != "Microsoft Windows Server 2022 Standard" {
		t.Fatalf("SO mal mapeado")
	}
	if *disp.SoVersion != "10.0.20348" || *disp.SoArquitectura != "x64" {
		t.Fatalf("versión/arquitectura mal mapeadas: %v %v", *disp.SoVersion, *disp.SoArquitectura)
	}
	// memory_count en KB: 67108864 KB → 65536 MB
	if disp.MemoriaMb == nil || *disp.MemoriaMb != 65536 {
		t.Fatalf("memoria KB→MB mal convertida: %v", disp.MemoriaMb)
	}
	// discos en MB: (476937 + 1907728) MB = 2384665 MB → 2329 GB
	if disp.DiscoTotalGb == nil || *disp.DiscoTotalGb != 2329 {
		t.Fatalf("disco MB→GB mal convertido: %v", disp.DiscoTotalGb)
	}
	if *disp.CpuDescripcion != "Intel Xeon Silver 4310 CPU @ 2.10GHz" {
		t.Fatalf("cpu: %v", *disp.CpuDescripcion)
	}
	if disp.Fuente != "open-audit" {
		t.Fatalf("fuente: %s", disp.Fuente)
	}
	if disp.VistoAt != "2026-08-31T12:00:00Z" {
		t.Fatalf("vistoAt: %s", disp.VistoAt)
	}

	// software
	if len(disp.Software) != 2 || disp.Software[0].Nombre != "Tango Gestión" {
		t.Fatalf("software mal mapeado: %+v", disp.Software)
	}
	// installed_on de OA (MySQL datetime) → RFC3339 del contrato
	if disp.Software[0].InstaladoAt == nil || *disp.Software[0].InstaladoAt != "2026-01-15T00:00:00Z" {
		t.Fatalf("instaladoAt: %+v", disp.Software[0].InstaladoAt)
	}
	// raw de la fila de software conservado
	if disp.Software[0].Raw["publisher"] != "Axoft" {
		t.Fatalf("raw de software no conservado")
	}

	// servicios (colección nmap)
	if len(disp.Servicios) != 3 {
		t.Fatalf("servicios: %d", len(disp.Servicios))
	}
	s445 := disp.Servicios[0]
	if s445.Puerto != 445 || s445.Protocolo != "tcp" || s445.EstadoPuerto != "open" || *s445.Servicio != "microsoft-ds" {
		t.Fatalf("servicio mal mapeado: %+v", s445)
	}

	// raw conserva el payload original (R14 de #59)
	if disp.Raw["attributes"] == nil {
		t.Fatalf("raw sin attributes")
	}
}

func TestMergeMACPrecedenciaYDivergencia(t *testing.T) {
	n := nuevoNormalizador(t)
	d := cargarDevice(t, "testdata/oa-device-servidor.json")

	// ARP del host difiere de OA → gana ARP, OA queda en raw para revisión
	arp := map[string]nmaphost.EntradaARP{
		"192.168.10.10": {IP: "192.168.10.10", MAC: "11-22-33-44-55-66", Vendor: "Dell"},
	}
	disp, err := n.DesdeOpenAudit(d, arp, visto)
	if err != nil {
		t.Fatalf("DesdeOpenAudit: %v", err)
	}
	if *disp.Mac != "112233445566" {
		t.Fatalf("el ARP del host debería ganar: %v", *disp.Mac)
	}
	meta, ok := disp.Raw["_sys_scan"].(map[string]any)
	if !ok || meta["mac_openaudit_divergente"] != "aabbccddee01" {
		t.Fatalf("la divergencia no quedó en raw: %v", disp.Raw["_sys_scan"])
	}
	// El payload original sigue intacto (raw aumentado, no transformado)
	if disp.Raw["attributes"] == nil || disp.Raw["included"] == nil {
		t.Fatalf("el raw original fue pisado")
	}

	// Sin ARP → MAC de OA
	disp2, _ := n.DesdeOpenAudit(d, nil, visto)
	if *disp2.Mac != "aabbccddee01" {
		t.Fatalf("sin ARP debería usar la MAC de OA: %v", *disp2.Mac)
	}

	// Sin ARP y sin MAC de OA → identidad por IP (mac nil)
	dSinMac := cargarDevice(t, "testdata/oa-device-impresora.json")
	disp3, _ := n.DesdeOpenAudit(dSinMac, nil, visto)
	if disp3.Mac != nil {
		t.Fatalf("sin fuentes de MAC debería quedar nil (identidad IP): %v", *disp3.Mac)
	}
}

func TestImpresoraSinCredencialesClasificaYValida(t *testing.T) {
	n := nuevoNormalizador(t)
	d := cargarDevice(t, "testdata/oa-device-impresora.json")

	disp, err := n.DesdeOpenAudit(d, nil, visto)
	if err != nil {
		t.Fatalf("DesdeOpenAudit: %v", err)
	}
	if disp.Tipo != "impresora" {
		t.Fatalf("type=printer debería mapear a impresora: %s", disp.Tipo)
	}
	// Campos vacíos → nil (nunca sintéticos, R16/R17 de #59)
	if disp.Hostname != nil || disp.SoNombre != nil || disp.MemoriaMb != nil {
		t.Fatalf("campos vacíos deberían ser nil: %+v", disp)
	}
}

func TestSinClasificarConPuertosUsaHeuristica(t *testing.T) {
	n := nuevoNormalizador(t)
	d := cargarDevice(t, "testdata/oa-device-sin-clasificar.json")

	disp, err := n.DesdeOpenAudit(d, nil, visto)
	if err != nil {
		t.Fatalf("DesdeOpenAudit: %v", err)
	}
	// type=unknown + puerto 554 (RTSP) → camara
	if disp.Tipo != "camara" {
		t.Fatalf("heurística de puertos falló: %s", disp.Tipo)
	}
}

func TestSoloARP(t *testing.T) {
	n := nuevoNormalizador(t)

	disp, err := n.SoloARP(nmaphost.EntradaARP{
		IP: "192.168.10.90", MAC: "9C:8E:99:AA:BB:CC", Vendor: "Ubiquiti Inc",
	}, visto)
	if err != nil {
		t.Fatalf("SoloARP: %v", err)
	}
	if disp.Fuente != "nmap" {
		t.Fatalf("fuente: %s", disp.Fuente)
	}
	if *disp.Mac != "9c8e99aabbcc" {
		t.Fatalf("mac: %v", *disp.Mac)
	}
	if *disp.Fabricante != "Ubiquiti Inc" {
		t.Fatalf("fabricante desde OUI: %v", *disp.Fabricante)
	}
	// Sin puertos ni tipo de OA: vendor de red solo no promueve (la regla
	// switch exige 161 + OUI); queda desconocido pero CON MAC (R8).
	if disp.Tipo != "desconocido" {
		t.Fatalf("sin evidencia debería ser desconocido: %s", disp.Tipo)
	}
}

func TestDescartaSinIP(t *testing.T) {
	n := nuevoNormalizador(t)
	d := openaudit.OADevice{ID: "99", Attributes: map[string]any{"hostname": "sin-ip"}}

	_, err := n.DesdeOpenAudit(d, nil, visto)
	if !errors.Is(err, ErrDispositivoInvalido) {
		t.Fatalf("device sin IP debería descartarse: %v", err)
	}
}

func TestValidarRechazaPayloadInvalido(t *testing.T) {
	n := nuevoNormalizador(t)

	// Tipo fuera de enum: el schema debe rechazarlo aunque el struct lo permita
	disp := &DispositivoInput{
		IP:        "192.168.1.1",
		Tipo:      "mainframe",
		Fuente:    "open-audit",
		Raw:       map[string]any{},
		Software:  []SoftwareInput{},
		Servicios: []ServicioInput{},
	}
	if err := n.Validar(disp); !errors.Is(err, ErrDispositivoInvalido) {
		t.Fatalf("tipo inválido debería fallar validación: %v", err)
	}
}

func TestNormalizarMAC(t *testing.T) {
	casos := map[string]string{
		"AA:BB:CC:DD:EE:FF": "aabbccddeeff",
		"aa-bb-cc-dd-ee-ff": "aabbccddeeff",
		"aabbccddeeff":      "aabbccddeeff",
		"aabb.ccdd.eeff":    "aabbccddeeff",
		"invalida":          "",
		"":                  "",
		"aabbccddeeff00":    "", // 14 hex: no es MAC
	}
	for entrada, esperado := range casos {
		if got := NormalizarMAC(entrada); got != esperado {
			t.Fatalf("NormalizarMAC(%q) = %q, esperado %q", entrada, got, esperado)
		}
	}
}
