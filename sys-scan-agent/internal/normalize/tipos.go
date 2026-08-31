package normalize

// DispositivoInput es el contrato de #59 (espejo de dispositivoInput Zod de
// AuditApp). Los nombres JSON son camelCase porque ese es el contrato del
// server; se valida contra el JSON Schema vendored antes de encolar (R25).
type DispositivoInput struct {
	Mac            *string         `json:"mac,omitempty"`
	IP             string          `json:"ip"`
	Hostname       *string         `json:"hostname,omitempty"`
	Fqdn           *string         `json:"fqdn,omitempty"`
	Fabricante     *string         `json:"fabricante,omitempty"`
	Modelo         *string         `json:"modelo,omitempty"`
	Serial         *string         `json:"serial,omitempty"`
	Tipo           string          `json:"tipo"`
	SoFamilia      *string         `json:"soFamilia,omitempty"`
	SoNombre       *string         `json:"soNombre,omitempty"`
	SoVersion      *string         `json:"soVersion,omitempty"`
	SoArquitectura *string         `json:"soArquitectura,omitempty"`
	CpuDescripcion *string         `json:"cpuDescripcion,omitempty"`
	MemoriaMb      *int            `json:"memoriaMb,omitempty"`
	DiscoTotalGb   *int            `json:"discoTotalGb,omitempty"`
	VistoAt        string          `json:"vistoAt,omitempty"`
	Fuente         string          `json:"fuente"`
	Raw            map[string]any  `json:"raw"`
	Software       []SoftwareInput `json:"software"`
	Servicios      []ServicioInput `json:"servicios"`
}

// SoftwareInput (contrato #59).
type SoftwareInput struct {
	Nombre      string         `json:"nombre"`
	Version     *string        `json:"version,omitempty"`
	Publisher   *string        `json:"publisher,omitempty"`
	InstaladoAt *string        `json:"instaladoAt,omitempty"`
	Raw         map[string]any `json:"raw"`
}

// ServicioInput (contrato #59).
type ServicioInput struct {
	Puerto       int            `json:"puerto"`
	Protocolo    string         `json:"protocolo"`
	EstadoPuerto string         `json:"estadoPuerto"`
	Servicio     *string        `json:"servicio,omitempty"`
	Producto     *string        `json:"producto,omitempty"`
	Version      *string        `json:"version,omitempty"`
	Banner       *string        `json:"banner,omitempty"`
	Raw          map[string]any `json:"raw"`
}
