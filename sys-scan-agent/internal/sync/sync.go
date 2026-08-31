// Package sync es el cliente HTTP de la API de ingesta de AuditApp (#60).
// Envía X-Agente-Version en todo request (R28/R30) y clasifica los errores
// del server para que el orquestador decida: 409 de versión → detener (R28);
// 429 → re-encolar con espera de ventana (#60 R23/R24).
package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ErrVersionIncompatible: AuditApp respondió 409 por major de agente no
// soportado (R20 de #60). El agente detiene el escaneo y pide actualizar.
var ErrVersionIncompatible = errors.New("versión del agente incompatible: hay que actualizar el agente")

// ErrNoAutorizado: token inválido, revocado o no corresponde al escaneo
// (401/404 de #60 R7–R9).
var ErrNoAutorizado = errors.New("el token no es válido para este escaneo")

// RateLimitError: 429 del server (#60 R23/R24). El orquestador re-encola
// esperando la ventana indicada (o el backoff estándar si no hay header).
type RateLimitError struct {
	RetryAfter time.Duration
}

func (e *RateLimitError) Error() string {
	return "límite de pedidos del servidor: reintentar en " + e.RetryAfter.String()
}

// ConflictoError: 409 de estado (transición inválida, consentimiento
// faltante, escaneo no mutable). No es de versión: es un error de fase.
type ConflictoError struct {
	Detalle string
}

func (e *ConflictoError) Error() string {
	return "conflicto de estado en AuditApp: " + e.Detalle
}

// EstadoEscaneo es la vista del GET /api/escaneos/{id} (#60 R11).
type EstadoEscaneo struct {
	Estado                 string  `json:"estado"`
	DispositivosDetectados int     `json:"dispositivosDetectados"`
	ConsentimientoOtorgado bool    `json:"consentimientoOtorgado"`
	Etiqueta               *string `json:"etiqueta"`
	RangoObjetivo          string  `json:"rangoObjetivo"`
	IniciadoAt             *string `json:"iniciadoAt"`
	FinalizadoAt           *string `json:"finalizadoAt"`
	Empresa                string  `json:"empresa"`
	Auditoria              string  `json:"auditoria"`
}

// Consentimiento (#60 R12): quién del cliente autoriza el escaneo.
type Consentimiento struct {
	ConsentimientoPor string    `json:"consentimientoPor"`
	ConsentimientoAt  time.Time `json:"consentimientoAt"`
}

// Client habla con la API de ingesta de un escaneo puntual.
type Client struct {
	baseURL    string
	escaneoID  string
	token      string
	version    string
	hostname   string
	httpClient *http.Client
}

// New construye el cliente. baseURL sin barra final (p. ej.
// https://app.auditoriaserviciosysistemas.com.ar).
func New(baseURL, escaneoID, token, version, hostname string) *Client {
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		escaneoID:  escaneoID,
		token:      token,
		version:    version,
		hostname:   hostname,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// EscaneoID expone el id derivado del token (la UI lo muestra para confirmar).
func (c *Client) EscaneoID() string {
	return c.escaneoID
}

type envelope struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
	Error   string          `json:"error"`
}

func (c *Client) hacer(ctx context.Context, metodo, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("serializar pedido: %w", err)
		}
		reader = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, metodo, c.baseURL+path, reader)
	if err != nil {
		return fmt.Errorf("armar pedido: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("X-Agente-Version", c.version)
	if c.hostname != "" {
		req.Header.Set("X-Agente-Hostname", c.hostname)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("sin conexión con AuditApp: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return fmt.Errorf("leer respuesta: %w", err)
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		rl := &RateLimitError{RetryAfter: 0}
		if h := resp.Header.Get("Retry-After"); h != "" {
			if segs, err := strconv.Atoi(h); err == nil {
				rl.RetryAfter = time.Duration(segs) * time.Second
			}
		}
		return rl
	}

	var env envelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return fmt.Errorf("respuesta inesperada del servidor (HTTP %d)", resp.StatusCode)
	}

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusNotFound {
		return ErrNoAutorizado
	}
	if resp.StatusCode == http.StatusConflict {
		if strings.Contains(strings.ToLower(env.Error), "versión del agente incompatible") {
			return ErrVersionIncompatible
		}
		return &ConflictoError{Detalle: env.Error}
	}
	if resp.StatusCode >= 400 || !env.Success {
		if env.Error != "" {
			return fmt.Errorf("AuditApp rechazó el pedido: %s", env.Error)
		}
		return fmt.Errorf("AuditApp respondió HTTP %d", resp.StatusCode)
	}

	if out != nil && len(env.Data) > 0 {
		if err := json.Unmarshal(env.Data, out); err != nil {
			return fmt.Errorf("interpretar respuesta: %w", err)
		}
	}
	return nil
}

// ObtenerEstado (GET /api/escaneos/{id}): valida el token y trae empresa,
// auditoría, etiqueta, rango y estado para confirmación del técnico (R13).
func (c *Client) ObtenerEstado(ctx context.Context) (*EstadoEscaneo, error) {
	var out EstadoEscaneo
	if err := c.hacer(ctx, http.MethodGet, "/api/escaneos/"+c.escaneoID, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// RegistrarConsentimiento (POST .../consentimiento, R14).
func (c *Client) RegistrarConsentimiento(ctx context.Context, cons Consentimiento) error {
	return c.hacer(ctx, http.MethodPost, "/api/escaneos/"+c.escaneoID+"/consentimiento", cons, nil)
}

// EnviarChunk (POST .../dispositivos): máximo 100 por pedido (#60 R15); el
// orquestador envía de a 50 (R27).
func (c *Client) EnviarChunk(ctx context.Context, dispositivos []json.RawMessage) error {
	if len(dispositivos) == 0 || len(dispositivos) > 100 {
		return fmt.Errorf("chunk inválido: %d dispositivos (1–100)", len(dispositivos))
	}
	body := map[string]any{"dispositivos": dispositivos}
	return c.hacer(ctx, http.MethodPost, "/api/escaneos/"+c.escaneoID+"/dispositivos", body, nil)
}

// Transicion (POST .../estado, R15/R17). detalle es obligatorio para
// `fallido` (#60 R18).
func (c *Client) Transicion(ctx context.Context, estado, detalle string) error {
	body := map[string]any{"estado": estado}
	if detalle != "" {
		body["errorDetalle"] = detalle
	}
	return c.hacer(ctx, http.MethodPost, "/api/escaneos/"+c.escaneoID+"/estado", body, nil)
}
