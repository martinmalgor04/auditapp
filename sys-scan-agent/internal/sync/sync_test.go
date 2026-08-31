package sync

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

type pedidoRegistrado struct {
	metodo   string
	path     string
	auth     string
	version  string
	hostname string
	body     map[string]any
}

func nuevoStub(t *testing.T, status int, respuesta any) (*httptest.Server, *atomic.Value) {
	t.Helper()
	var ultimo atomic.Value
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reg := pedidoRegistrado{
			metodo:   r.Method,
			path:     r.URL.Path,
			auth:     r.Header.Get("Authorization"),
			version:  r.Header.Get("X-Agente-Version"),
			hostname: r.Header.Get("X-Agente-Hostname"),
		}
		if r.Body != nil {
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			reg.body = body
		}
		ultimo.Store(reg)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(respuesta)
	}))
	t.Cleanup(srv.Close)
	return srv, &ultimo
}

func TestObtenerEstadoEnviaHeadersYDevuelveContexto(t *testing.T) {
	srv, ultimo := nuevoStub(t, 200, map[string]any{
		"success": true,
		"data": map[string]any{
			"estado":                 "pendiente",
			"dispositivosDetectados": 0,
			"consentimientoOtorgado": false,
			"etiqueta":               "VLAN administración",
			"rangoObjetivo":          "192.168.10.0/24",
			"empresa":                "Acme SA",
			"auditoria":              "Auditoría IT 2026",
		},
		"error": nil,
	})

	c := New(srv.URL, "esc-123", "token-secreto", "1.2.3", "notebook-facu")
	estado, err := c.ObtenerEstado(context.Background())
	if err != nil {
		t.Fatalf("ObtenerEstado: %v", err)
	}

	reg := ultimo.Load().(pedidoRegistrado)
	if reg.auth != "Bearer token-secreto" {
		t.Fatalf("falta Bearer token: %q", reg.auth)
	}
	if reg.version != "1.2.3" {
		t.Fatalf("falta X-Agente-Version: %q", reg.version)
	}
	if reg.hostname != "notebook-facu" {
		t.Fatalf("falta X-Agente-Hostname: %q", reg.hostname)
	}
	if reg.path != "/api/escaneos/esc-123" {
		t.Fatalf("path inesperado: %q", reg.path)
	}
	if estado.Empresa != "Acme SA" || estado.RangoObjetivo != "192.168.10.0/24" {
		t.Fatalf("contexto mal parseado: %+v", estado)
	}
}

func TestConsentimientoPosteaBody(t *testing.T) {
	srv, ultimo := nuevoStub(t, 200, map[string]any{"success": true, "data": map[string]any{}, "error": nil})

	c := New(srv.URL, "esc-123", "tok", "1.0.0", "")
	ahora := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	if err := c.RegistrarConsentimiento(context.Background(), Consentimiento{
		ConsentimientoPor: "María Pérez",
		ConsentimientoAt:  ahora,
	}); err != nil {
		t.Fatalf("RegistrarConsentimiento: %v", err)
	}

	reg := ultimo.Load().(pedidoRegistrado)
	if reg.path != "/api/escaneos/esc-123/consentimiento" || reg.metodo != http.MethodPost {
		t.Fatalf("pedido mal armado: %s %s", reg.metodo, reg.path)
	}
	if reg.body["consentimientoPor"] != "María Pérez" {
		t.Fatalf("body sin consentimientoPor: %v", reg.body)
	}
}

func TestEnviarChunkValidaLimites(t *testing.T) {
	c := New("http://localhost:0", "esc-123", "tok", "1.0.0", "")

	if err := c.EnviarChunk(context.Background(), nil); err == nil {
		t.Fatalf("chunk vacío debería fallar antes de pegarle al server")
	}
	if err := c.EnviarChunk(context.Background(), make([]json.RawMessage, 101)); err == nil {
		t.Fatalf("chunk de 101 debería fallar antes de pegarle al server")
	}
}

func TestEnviarChunkPosteaDispositivos(t *testing.T) {
	srv, ultimo := nuevoStub(t, 200, map[string]any{"success": true, "data": map[string]any{"recibidos": 2}, "error": nil})

	c := New(srv.URL, "esc-123", "tok", "1.0.0", "")
	dispositivos := []json.RawMessage{
		json.RawMessage(`{"ip":"192.168.1.10"}`),
		json.RawMessage(`{"ip":"192.168.1.11"}`),
	}
	if err := c.EnviarChunk(context.Background(), dispositivos); err != nil {
		t.Fatalf("EnviarChunk: %v", err)
	}

	reg := ultimo.Load().(pedidoRegistrado)
	lista, ok := reg.body["dispositivos"].([]any)
	if !ok || len(lista) != 2 {
		t.Fatalf("body sin dispositivos: %v", reg.body)
	}
}

func Test409DeVersionSeClasifica(t *testing.T) {
	srv, _ := nuevoStub(t, 409, map[string]any{
		"success": false, "data": nil,
		"error": "Versión del agente incompatible: actualice el agente",
	})

	c := New(srv.URL, "esc-123", "tok", "0.9.0", "")
	_, err := c.ObtenerEstado(context.Background())
	if !errors.Is(err, ErrVersionIncompatible) {
		t.Fatalf("esperaba ErrVersionIncompatible, vino %v", err)
	}
}

func Test409DeTransicionEsConflictoDeFase(t *testing.T) {
	srv, _ := nuevoStub(t, 409, map[string]any{
		"success": false, "data": nil,
		"error": "Transición inválida de completado a en_curso",
	})

	c := New(srv.URL, "esc-123", "tok", "1.0.0", "")
	err := c.Transicion(context.Background(), "en_curso", "")
	var conflicto *ConflictoError
	if !errors.As(err, &conflicto) {
		t.Fatalf("esperaba ConflictoError, vino %T: %v", err, err)
	}
	if errors.Is(err, ErrVersionIncompatible) {
		t.Fatalf("un 409 de transición no es de versión")
	}
}

func Test401EsNoAutorizado(t *testing.T) {
	srv, _ := nuevoStub(t, 401, map[string]any{"success": false, "data": nil, "error": "Token inválido"})

	c := New(srv.URL, "esc-123", "tok-malo", "1.0.0", "")
	_, err := c.ObtenerEstado(context.Background())
	if !errors.Is(err, ErrNoAutorizado) {
		t.Fatalf("esperaba ErrNoAutorizado, vino %v", err)
	}
}

func Test429EsRateLimitConVentana(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "45")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(429)
		_, _ = w.Write([]byte(`{"success":false,"data":null,"error":"Demasiados requests"}`))
	}))
	t.Cleanup(srv.Close)

	c := New(srv.URL, "esc-123", "tok", "1.0.0", "")
	err := c.Transicion(context.Background(), "en_curso", "")
	var rl *RateLimitError
	if !errors.As(err, &rl) {
		t.Fatalf("esperaba RateLimitError, vino %T: %v", err, err)
	}
	if rl.RetryAfter != 45*time.Second {
		t.Fatalf("RetryAfter mal parseado: %v", rl.RetryAfter)
	}
}

func Test500EsErrorGenericoSinDatosSensibles(t *testing.T) {
	srv, _ := nuevoStub(t, 500, map[string]any{"success": false, "data": nil, "error": "Error interno"})

	c := New(srv.URL, "esc-123", "tok", "1.0.0", "")
	err := c.Transicion(context.Background(), "completado", "")
	if err == nil || errors.Is(err, ErrVersionIncompatible) || errors.Is(err, ErrNoAutorizado) {
		t.Fatalf("500 mal clasificado: %v", err)
	}
}
