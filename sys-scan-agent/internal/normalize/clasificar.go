package normalize

import "strings"

// Clasificación de `tipo` (R26): tabla del design verificada contra los
// valores reales de Open-AudIT 6.x. Nunca promover sin evidencia (R17 de
// #59): el default es `desconocido`.

// vendorsDeRed: OUIs/fabricantes típicos de equipamiento de red (heurística
// "Solo Nmap: 161/SNMP + OUI de fabricante de red → switch").
var vendorsDeRed = []string{
	"cisco", "ubiquiti", "juniper", "mikrotik", "aruba", "netgear",
	"tp-link", "d-link", "fortinet", "mikrotik", "ruckus", "extreme",
	"huawei", "zyxel", "edgeswitch", "unifi",
}

// esVendorDeRed reporta si el vendor OUI sugiere equipamiento de red.
func esVendorDeRed(vendor string) bool {
	v := strings.ToLower(vendor)
	for _, conocido := range vendorsDeRed {
		if strings.Contains(v, conocido) {
			return true
		}
	}
	return false
}

// ClasificarTipo aplica la tabla de mapeo en orden de evidencia (R26).
//
//	oaType:      devices.type de Open-AudIT (puede estar vacío/unknown)
//	osName:      devices.os_name
//	formFactor:  devices.form_factor
//	puertos:     puertos abiertos observados (colección nmap de OA o barrido host)
//	vendorOUI:   vendor OUI del barrido ARP del host
func ClasificarTipo(oaType, osName, formFactor string, puertos []int, vendorOUI string) string {
	t := strings.ToLower(strings.TrimSpace(oaType))

	switch t {
	case "switch":
		return "switch"
	case "router":
		return "router"
	case "firewall":
		return "firewall"
	case "printer":
		return "impresora"
	case "camera":
		return "camara"
	case "nas", "storage":
		return "nas"
	case "ups":
		return "ups"
	case "phone", "pbx", "voip", "voip phone", "voip adapter":
		return "telefonia"
	case "mobile", "tablet", "smartphone", "mobile phone":
		return "movil"
	case "virtual machine", "hypervisor", "virtual":
		return "virtual"
	}

	if t == "computer" || t == "server" {
		if strings.Contains(strings.ToLower(osName), "server") || t == "server" {
			return "servidor"
		}
		ff := strings.ToLower(formFactor)
		if strings.Contains(ff, "laptop") || strings.Contains(ff, "notebook") || strings.Contains(ff, "portable") {
			return "notebook"
		}
		return "workstation"
	}

	// Heurísticas de puertos (sin clasificación útil de OA).
	if tieneAlgunPuerto(puertos, 9100, 515, 631) {
		return "impresora"
	}
	if tieneAlgunPuerto(puertos, 554, 8554) {
		return "camara"
	}
	if tieneAlgunPuerto(puertos, 161) && esVendorDeRed(vendorOUI) {
		return "switch"
	}

	return "desconocido"
}

func tieneAlgunPuerto(puertos []int, buscados ...int) bool {
	for _, p := range puertos {
		for _, b := range buscados {
			if p == b {
				return true
			}
		}
	}
	return false
}
