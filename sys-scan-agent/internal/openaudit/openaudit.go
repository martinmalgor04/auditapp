// Package openaudit es el cliente REST de Open-AudIT (contenedor local,
// R23). Carga credenciales, crea y ejecuta el discovery sobre el rango del
// escaneo, monitorea el avance y recolecta los devices paginados.
//
// Nombres de atributos verificados contra el schema oficial de Open-AudIT
// 6.x (repo Opmantek/open-audit, other/open-audit.sql) — ver
// internal/normalize para la tabla de mapeo ajustada.
package openaudit

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/serviciosysistemas/sys-scan-agent/internal/creds"
)

// ErrNoListo: la API del contenedor no respondió a tiempo (R32 lo trata como
// contenedor caído).
var ErrNoListo = errors.New("Open-AudIT no respondió a tiempo")

// OADevice es un device de Open-AudIT con sus colecciones asociadas.
type OADevice struct {
	ID         string
	Attributes map[string]any              // columnas de la tabla `devices`
	Included   map[string][]map[string]any // network, ip, nmap, software, disk, processor
	Raw        map[string]any              // payload original sin transformación (#59 R14)
}

// DiscoveryEstado es el avance del discovery (polling).
type DiscoveryEstado struct {
	ID     string
	Status string // running | complete | failed | ...
	// Log de avance textual si la API lo expone.
	Detalle string
}

// Client habla con la API de Open-AudIT de UN contenedor de escaneo.
type Client struct {
	baseURL    string
	usuario    string
	password   string
	httpClient *http.Client
}

// New construye el cliente contra la API publicada en 127.0.0.1 por el
// contenedor (R22). usuario/password son los del admin local de la imagen
// (instalación fresca; el contenedor es efímero y solo localhost).
func New(baseURL, usuario, password string) *Client {
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		usuario:    usuario,
		password:   password,
		httpClient: &http.Client{Timeout: 60 * time.Second},
	}
}

// hacer ejecuta un request JSON contra la API (Basic Auth del admin local).
func (c *Client) hacer(ctx context.Context, metodo, path string, query url.Values, body any, out any) error {
	u := c.baseURL + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}

	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("serializar pedido a Open-AudIT: %w", err)
		}
		reader = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, metodo, u, reader)
	if err != nil {
		return fmt.Errorf("armar pedido a Open-AudIT: %w", err)
	}
	req.SetBasicAuth(c.usuario, c.password)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("sin conexión con Open-AudIT local: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64<<20))
	if err != nil {
		return fmt.Errorf("leer respuesta de Open-AudIT: %w", err)
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("Open-AudIT respondió HTTP %d", resp.StatusCode)
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("interpretar respuesta de Open-AudIT: %w", err)
		}
	}
	return nil
}

// EsperarListo hace polling al healthcheck hasta que la API responde o vence
// el ctx (el contenedor tarda en levantar MariaDB + Apache, R23).
func (c *Client) EsperarListo(ctx context.Context) error {
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/", nil)
		if err == nil {
			req.SetBasicAuth(c.usuario, c.password)
			if resp, err := c.httpClient.Do(req); err == nil {
				_ = resp.Body.Close()
				if resp.StatusCode < 500 {
					return nil
				}
			}
		}
		select {
		case <-ctx.Done():
			return ErrNoListo
		case <-time.After(2 * time.Second):
		}
	}
}

// ── Credenciales (R23 / R10) ─────────────────────────────────────────────

// atributosCredencial mapea la Credencial del agente al payload de la API de
// Open-AudIT (collection `credentials`, type windows/ssh/snmp/snmp_v3).
func atributosCredencial(c creds.Credencial) map[string]any {
	credenciales := map[string]any{}
	switch c.Tipo {
	case creds.TipoWindows, creds.TipoSSH:
		credenciales["username"] = c.Usuario
		credenciales["password"] = c.Password
	case creds.TipoSNMP:
		credenciales["community"] = c.Community
	case creds.TipoSNMPv3:
		credenciales["security_name"] = c.Usuario
		credenciales["authentication_protocol"] = c.AuthProtocol
		credenciales["authentication_passphrase"] = c.AuthPassphrase
		credenciales["privacy_protocol"] = c.PrivProtocol
		credenciales["privacy_passphrase"] = c.PrivPassphrase
	}
	return map[string]any{
		"name":        c.Nombre,
		"type":        string(c.Tipo),
		"credentials": credenciales,
		"org_id":      1,
	}
}

// CrearCredenciales carga las credenciales del escaneo en Open-AudIT (R23) y
// devuelve los ids creados (para borrarlas al cerrar, R10).
func (c *Client) CrearCredenciales(ctx context.Context, lista []creds.Credencial) ([]string, error) {
	ids := make([]string, 0, len(lista))
	for _, cred := range lista {
		body := map[string]any{
			"data": map[string]any{
				"type":       "credentials",
				"attributes": atributosCredencial(cred),
			},
		}
		var resp struct {
			Data struct {
				ID json.RawMessage `json:"id"`
			} `json:"data"`
		}
		if err := c.hacer(ctx, http.MethodPost, "/credentials", nil, body, &resp); err != nil {
			return ids, fmt.Errorf("crear credencial %q: %w", cred.Nombre, err)
		}
		ids = append(ids, normalizarID(resp.Data.ID))
	}
	return ids, nil
}

// BorrarCredenciales elimina las credenciales del escaneo de Open-AudIT
// (R10). Best-effort por id: acumula errores pero intenta todas.
func (c *Client) BorrarCredenciales(ctx context.Context, ids []string) error {
	var fallos []string
	for _, id := range ids {
		if err := c.hacer(ctx, http.MethodDelete, "/credentials/"+url.PathEscape(id), nil, nil, nil); err != nil {
			fallos = append(fallos, id)
		}
	}
	if len(fallos) > 0 {
		return fmt.Errorf("no se pudieron borrar %d credenciales de Open-AudIT", len(fallos))
	}
	return nil
}

// ── Discovery (R23) ──────────────────────────────────────────────────────

// EjecutarDiscovery crea el discovery type=subnet sobre el rango y lo lanza.
// Devuelve el id del discovery para polling.
func (c *Client) EjecutarDiscovery(ctx context.Context, rango string) (string, error) {
	body := map[string]any{
		"data": map[string]any{
			"type": "discoveries",
			"attributes": map[string]any{
				"name":   "Escaneo SyS " + time.Now().Format("2006-01-02 15:04"),
				"type":   "subnet",
				"subnet": rango,
				"org_id": 1,
			},
		},
	}
	var resp struct {
		Data struct {
			ID json.RawMessage `json:"id"`
		} `json:"data"`
	}
	if err := c.hacer(ctx, http.MethodPost, "/discoveries", nil, body, &resp); err != nil {
		return "", fmt.Errorf("crear discovery: %w", err)
	}
	id := normalizarID(resp.Data.ID)
	if id == "" {
		return "", errors.New("Open-AudIT no devolvió id de discovery")
	}

	// Lanzar la ejecución (GET .../execute según la API documentada).
	if err := c.hacer(ctx, http.MethodGet, "/discoveries/"+url.PathEscape(id)+"/execute", nil, nil, nil); err != nil {
		return "", fmt.Errorf("ejecutar discovery: %w", err)
	}
	return id, nil
}

// EstadoDiscovery consulta el avance del discovery (polling del orquestador).
func (c *Client) EstadoDiscovery(ctx context.Context, id string) (*DiscoveryEstado, error) {
	var resp struct {
		Data struct {
			ID         json.RawMessage `json:"id"`
			Attributes struct {
				Status string `json:"status"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := c.hacer(ctx, http.MethodGet, "/discoveries/"+url.PathEscape(id), nil, nil, &resp); err != nil {
		return nil, fmt.Errorf("estado del discovery: %w", err)
	}
	return &DiscoveryEstado{
		ID:     normalizarID(resp.Data.ID),
		Status: resp.Data.Attributes.Status,
	}, nil
}

// ── Devices (R23, R25) ───────────────────────────────────────────────────

// Includes que pide la normalización (verificados contra DevicesModel de la
// versión pineada: colecciones `ip`, `network`, `nmap`, `software`, `disk`,
// `processor`).
const includesDevice = "ip,network,nmap,software,disk,processor"

// Dispositivos recolecta todos los devices del discovery con sus
// colecciones, paginando de a `paginaTam`.
func (c *Client) Dispositivos(ctx context.Context) ([]OADevice, error) {
	const paginaTam = 100
	var out []OADevice
	offset := 0
	for {
		q := url.Values{
			"format":  {"json"},
			"include": {includesDevice},
			"limit":   {strconv.Itoa(paginaTam)},
			"offset":  {strconv.Itoa(offset)},
		}
		var resp struct {
			Data []struct {
				ID         json.RawMessage             `json:"id"`
				Attributes map[string]any              `json:"attributes"`
				Included   map[string][]map[string]any `json:"included"`
			} `json:"data"`
			Meta struct {
				Total int `json:"total"`
			} `json:"meta"`
		}
		if err := c.hacer(ctx, http.MethodGet, "/devices", q, nil, &resp); err != nil {
			return nil, fmt.Errorf("listar devices: %w", err)
		}
		for _, d := range resp.Data {
			raw := map[string]any{
				"id":         normalizarID(d.ID),
				"attributes": d.Attributes,
				"included":   d.Included,
			}
			out = append(out, OADevice{
				ID:         normalizarID(d.ID),
				Attributes: d.Attributes,
				Included:   d.Included,
				Raw:        raw,
			})
		}
		offset += len(resp.Data)
		if len(resp.Data) < paginaTam || (resp.Meta.Total > 0 && offset >= resp.Meta.Total) {
			break
		}
	}
	return out, nil
}

// normalizarID: la API devuelve id como número o string según el endpoint.
func normalizarID(raw json.RawMessage) string {
	s := strings.Trim(string(raw), `"`)
	if s == "" || s == "null" {
		return ""
	}
	return s
}
