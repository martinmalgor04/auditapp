package normalize

import "testing"

// Tabla completa de clasificación (R26), incluidos los defaults.
func TestClasificarTipo(t *testing.T) {
	casos := []struct {
		nombre                     string
		oaType, osName, formFactor string
		puertos                    []int
		vendor                     string
		esperado                   string
	}{
		{"OA switch", "switch", "", "", nil, "", "switch"},
		{"OA router", "router", "", "", nil, "", "router"},
		{"OA firewall", "firewall", "", "", nil, "", "firewall"},
		{"OA printer", "printer", "", "", nil, "", "impresora"},
		{"OA camera", "camera", "", "", nil, "", "camara"},
		{"OA nas", "nas", "", "", nil, "", "nas"},
		{"OA ups", "ups", "", "", nil, "", "ups"},
		{"OA phone", "phone", "", "", nil, "", "telefonia"},
		{"OA pbx", "pbx", "", "", nil, "", "telefonia"},
		{"OA mobile", "mobile", "", "", nil, "", "movil"},
		{"OA tablet", "tablet", "", "", nil, "", "movil"},
		{"OA virtual machine", "virtual machine", "", "", nil, "", "virtual"},
		{"OA hypervisor", "hypervisor", "", "", nil, "", "virtual"},
		{"computer server OS", "computer", "Microsoft Windows Server 2022", "", nil, "", "servidor"},
		{"computer type server", "server", "", "", nil, "", "servidor"},
		{"computer laptop", "computer", "Windows 11 Pro", "Laptop", nil, "", "notebook"},
		{"computer desktop", "computer", "Windows 11 Pro", "Desktop", nil, "", "workstation"},
		{"computer sin form factor", "computer", "Windows 11 Pro", "", nil, "", "workstation"},
		{"solo nmap impresora 9100", "", "", "", []int{9100}, "", "impresora"},
		{"solo nmap impresora 515", "", "", "", []int{515}, "", "impresora"},
		{"solo nmap camara rtsp", "", "", "", []int{554}, "", "camara"},
		{"solo nmap snmp + vendor red", "", "", "", []int{161}, "Cisco Systems", "switch"},
		{"snmp sin vendor de red", "", "", "", []int{161}, "Dell Inc.", "desconocido"},
		{"sin evidencia", "", "", "", nil, "", "desconocido"},
		{"unknown sin puertos", "unknown", "", "", nil, "", "desconocido"},
		{"unclassified", "unclassified", "", "", nil, "", "desconocido"},
	}

	for _, c := range casos {
		t.Run(c.nombre, func(t *testing.T) {
			got := ClasificarTipo(c.oaType, c.osName, c.formFactor, c.puertos, c.vendor)
			if got != c.esperado {
				t.Fatalf("ClasificarTipo(%q, %q, %q, %v, %q) = %q, esperado %q",
					c.oaType, c.osName, c.formFactor, c.puertos, c.vendor, got, c.esperado)
			}
		})
	}
}
