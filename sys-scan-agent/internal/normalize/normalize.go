// Package normalize convierte devices de Open-AudIT y hosts del barrido ARP
// al contrato `dispositivoInput` de #59, validando contra el JSON Schema
// exportado de AuditApp (R25) antes de encolar.
//
// Tabla de mapeo verificada contra el schema oficial de Open-AudIT 6.x
// (other/open-audit.sql del repo Opmantek/open-audit) — ajustes respecto del
// design original:
//   - memory_count viene en KB → memoriaMb = KB/1024
//   - disk.size viene en MB → discoTotalGb = ΣMB/1024
//   - MAC por IP: colección `ip` de OA (tiene mac+ip), no `network`
//   - fqdn ← dns_fqdn (fallback fqdn); arquitectura ← os_arch (fallback os_bit)
//   - puertos: colección `nmap` (port/protocol/name/program; open implícito)
package normalize

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"strings"
	"time"

	"github.com/santhosh-tekuri/jsonschema/v6"

	"github.com/serviciosysistemas/sys-scan-agent/internal/nmaphost"
	"github.com/serviciosysistemas/sys-scan-agent/internal/openaudit"
)

//go:embed schema/dispositivo-input.schema.json
var schemaJSON []byte

// ErrDispositivoInvalido: el dispositivo no valida contra el contrato de #59;
// se descarta y se loguea el motivo (R25), sin frenar el resto del escaneo.
var ErrDispositivoInvalido = errors.New("dispositivo no válido según el contrato")

// Normalizador valida y mapea dispositivos al contrato.
type Normalizador struct {
	schema *jsonschema.Schema
	log    *slog.Logger
}

// New compila el JSON Schema vendored (exportado de los Zod de #59, T1).
func New(log *slog.Logger) (*Normalizador, error) {
	if log == nil {
		log = slog.Default()
	}
	doc, err := jsonschema.UnmarshalJSON(strings.NewReader(string(schemaJSON)))
	if err != nil {
		return nil, fmt.Errorf("schema embebido inválido: %w", err)
	}
	c := jsonschema.NewCompiler()
	if err := c.AddResource("dispositivo-input.schema.json", doc); err != nil {
		return nil, err
	}
	schema, err := c.Compile("dispositivo-input.schema.json")
	if err != nil {
		return nil, fmt.Errorf("compilar schema: %w", err)
	}
	return &Normalizador{schema: schema, log: log}, nil
}

// ── helpers de extracción sobre map[string]any ───────────────────────────

func str(m map[string]any, claves ...string) string {
	for _, k := range claves {
		if v, ok := m[k]; ok {
			switch t := v.(type) {
			case string:
				if s := strings.TrimSpace(t); s != "" {
					return s
				}
			case float64:
				// ids numéricos y similares serializados como número
				return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%v", t), "0"), ".")
			}
		}
	}
	return ""
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func num(m map[string]any, claves ...string) (float64, bool) {
	for _, k := range claves {
		if v, ok := m[k]; ok {
			switch t := v.(type) {
			case float64:
				return t, true
			case string:
				var f float64
				if _, err := fmt.Sscanf(t, "%g", &f); err == nil {
					return f, true
				}
			}
		}
	}
	return 0, false
}

// fechaOA convierte datetimes de Open-AudIT (MySQL "2006-01-02 15:04:05" o
// date "2006-01-02") a RFC3339, que es lo que el contrato exige
// (z.coerce.date()). Vacío o irreconocible → "".
func fechaOA(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || strings.HasPrefix(s, "0000-00-00") {
		return ""
	}
	for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02", time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC().Format(time.RFC3339)
		}
	}
	return ""
}

// ── Merge de MACs (R6) ───────────────────────────────────────────────────

// macDeOpenAudit busca en la colección `ip` de OA la fila con esa IP y
// devuelve su MAC normalizada (verificado: tabla `ip` tiene mac+ip).
func macDeOpenAudit(d openaudit.OADevice, ip string) string {
	for _, fila := range d.Included["ip"] {
		if str(fila, "ip") == ip {
			if mac := NormalizarMAC(str(fila, "mac")); mac != "" {
				return mac
			}
		}
	}
	// Fallback: primera MAC de la colección network.
	for _, fila := range d.Included["network"] {
		if mac := NormalizarMAC(str(fila, "mac")); mac != "" {
			return mac
		}
	}
	return ""
}

// mergeMAC aplica la precedencia R6: ARP host → OA → sin MAC. Si difieren,
// la de OA queda señalada en raw._sys_scan para revisión humana (#62) — el
// payload original queda intacto bajo sus claves (raw aumentado, no
// transformado).
func mergeMAC(d openaudit.OADevice, ip string, arpHost map[string]nmaphost.EntradaARP, raw map[string]any) *string {
	var macARP, macOA string
	if entrada, ok := arpHost[ip]; ok {
		macARP = NormalizarMAC(entrada.MAC)
	}
	macOA = macDeOpenAudit(d, ip)

	if macARP != "" && macOA != "" && macARP != macOA {
		raw["_sys_scan"] = map[string]any{
			"mac_openaudit_divergente": macOA,
			"motivo":                   "ARP del host y Open-AudIT difieren para esta IP; revisar en #62",
		}
	}
	if macARP != "" {
		return &macARP
	}
	if macOA != "" {
		return &macOA
	}
	return nil
}

// ── Mapeo principal ──────────────────────────────────────────────────────

// DesdeOpenAudit normaliza un device de Open-AudIT (fuente `open-audit`).
func (n *Normalizador) DesdeOpenAudit(d openaudit.OADevice, arpHost map[string]nmaphost.EntradaARP, vistoAt time.Time) (*DispositivoInput, error) {
	a := d.Attributes
	ip := str(a, "ip")
	if ip == "" {
		return nil, fmt.Errorf("%w: device %s sin IP", ErrDispositivoInvalido, d.ID)
	}

	raw := d.Raw
	if raw == nil {
		raw = map[string]any{}
	}

	// Puertos observados por OA (colección nmap) para clasificación y servicios.
	var puertos []int
	var servicios []ServicioInput
	for _, fila := range d.Included["nmap"] {
		pf, ok := num(fila, "port")
		if !ok {
			continue
		}
		puerto := int(pf)
		puertos = append(puertos, puerto)
		protocolo := str(fila, "protocol")
		if protocolo == "" {
			protocolo = "tcp"
		}
		servicios = append(servicios, ServicioInput{
			Puerto:       puerto,
			Protocolo:    protocolo,
			EstadoPuerto: "open", // la colección nmap de OA solo registra abiertos
			Servicio:     strPtr(str(fila, "name")),
			Producto:     strPtr(str(fila, "program")),
			Raw:          fila,
		})
	}

	var vendorARP string
	if entrada, ok := arpHost[ip]; ok {
		vendorARP = entrada.Vendor
	}

	// fabricante: OA manufacturer; fallback vendor OUI del barrido host.
	fabricante := str(a, "manufacturer")
	if fabricante == "" {
		fabricante = vendorARP
	}

	// memoria: memory_count viene en KB (verificado en audit_linux.sh de OA).
	var memoriaMb *int
	if kb, ok := num(a, "memory_count"); ok && kb > 0 {
		mb := int(math.Round(kb / 1024))
		if mb > 0 {
			memoriaMb = &mb
		}
	}

	// discos: Σ disk.size (MB, verificado en schema de OA) → GB.
	var discoTotalGb *int
	var totalMb float64
	for _, fila := range d.Included["disk"] {
		if mb, ok := num(fila, "size"); ok && mb > 0 {
			totalMb += mb
		}
	}
	if totalMb > 0 {
		gb := int(math.Round(totalMb / 1024))
		if gb > 0 {
			discoTotalGb = &gb
		}
	}

	// cpu: primer procesador de la colección processor.
	var cpu *string
	if procs := d.Included["processor"]; len(procs) > 0 {
		cpu = strPtr(str(procs[0], "description", "name"))
	}

	// arquitectura: os_arch (x86_64, ARM64…); fallback os_bit (32/64).
	soArq := str(a, "os_arch")
	if soArq == "" {
		if bit, ok := num(a, "os_bit"); ok && bit > 0 {
			soArq = fmt.Sprintf("%d-bit", int(bit))
		}
	}

	// software instalado.
	var software []SoftwareInput
	for _, fila := range d.Included["software"] {
		nombre := str(fila, "name")
		if nombre == "" {
			continue
		}
		software = append(software, SoftwareInput{
			Nombre:      nombre,
			Version:     strPtr(str(fila, "version")),
			Publisher:   strPtr(str(fila, "publisher")),
			InstaladoAt: strPtr(fechaOA(str(fila, "installed_on", "install_date"))),
			Raw:         fila,
		})
	}

	disp := &DispositivoInput{
		Mac:            mergeMAC(d, ip, arpHost, raw),
		IP:             ip,
		Hostname:       strPtr(str(a, "hostname")),
		Fqdn:           strPtr(str(a, "dns_fqdn", "fqdn")),
		Fabricante:     strPtr(fabricante),
		Modelo:         strPtr(str(a, "model")),
		Serial:         strPtr(str(a, "serial")),
		Tipo:           ClasificarTipo(str(a, "type"), str(a, "os_name"), str(a, "form_factor"), puertos, vendorARP),
		SoFamilia:      strPtr(str(a, "os_group")),
		SoNombre:       strPtr(str(a, "os_name")),
		SoVersion:      strPtr(str(a, "os_version")),
		SoArquitectura: strPtr(soArq),
		CpuDescripcion: cpu,
		MemoriaMb:      memoriaMb,
		DiscoTotalGb:   discoTotalGb,
		VistoAt:        vistoAt.UTC().Format(time.RFC3339),
		Fuente:         "open-audit",
		Raw:            raw,
		Software:       software,
		Servicios:      servicios,
	}
	if disp.Software == nil {
		disp.Software = []SoftwareInput{}
	}
	if disp.Servicios == nil {
		disp.Servicios = []ServicioInput{}
	}

	if err := n.Validar(disp); err != nil {
		return nil, err
	}
	return disp, nil
}

// SoloARP genera el dispositivo de un host que respondió ARP pero Open-AudIT
// no reportó (fuente `nmap`): IP + MAC real del segmento + vendor OUI (R8:
// el 100 % de los hosts que respondan ARP deben quedar registrados).
func (n *Normalizador) SoloARP(e nmaphost.EntradaARP, vistoAt time.Time) (*DispositivoInput, error) {
	if e.IP == "" {
		return nil, fmt.Errorf("%w: host ARP sin IP", ErrDispositivoInvalido)
	}
	raw := map[string]any{
		"fuente_detalle": "barrido_arp_host",
		"ip":             e.IP,
		"mac":            e.MAC,
		"vendor":         e.Vendor,
	}
	disp := &DispositivoInput{
		Mac:        strPtr(NormalizarMAC(e.MAC)),
		IP:         e.IP,
		Fabricante: strPtr(e.Vendor),
		Tipo:       ClasificarTipo("", "", "", nil, e.Vendor),
		VistoAt:    vistoAt.UTC().Format(time.RFC3339),
		Fuente:     "nmap",
		Raw:        raw,
		Software:   []SoftwareInput{},
		Servicios:  []ServicioInput{},
	}
	if err := n.Validar(disp); err != nil {
		return nil, err
	}
	return disp, nil
}

// Validar verifica el dispositivo contra el JSON Schema del contrato (R25).
func (n *Normalizador) Validar(d *DispositivoInput) error {
	data, err := json.Marshal(d)
	if err != nil {
		return fmt.Errorf("serializar para validar: %w", err)
	}
	doc, err := jsonschema.UnmarshalJSON(strings.NewReader(string(data)))
	if err != nil {
		return err
	}
	if err := n.schema.Validate(doc); err != nil {
		return fmt.Errorf("%w: %s", ErrDispositivoInvalido, err.Error())
	}
	return nil
}

// Descartar loguea el motivo de descarte (sin credenciales — logx redacta) y
// permite continuar con el resto (R25).
func (n *Normalizador) Descartar(d openaudit.OADevice, err error) {
	n.log.Warn("dispositivo descartado por no validar",
		"oa_device_id", d.ID,
		"ip", str(d.Attributes, "ip"),
		"motivo", err.Error())
}
