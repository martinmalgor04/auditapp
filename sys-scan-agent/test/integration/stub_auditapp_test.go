//go:build integration

package integration

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"
)

// stubAuditApp es un servidor fiel al contrato de la API de ingesta #60:
// envelope {success,data,error}, Bearer token, X-Agente-Version obligatorio
// con chequeo de major, y upsert idempotente por identidad (MAC → IP, R12
// de #59 / R13 de #59) para verificar la idempotencia de reenvíos (R19).
type stubAuditApp struct {
	mu           sync.Mutex
	token        string
	escaneoID    string
	estado       string
	consentido   bool
	dispositivos map[string]map[string]any // identidad → dispositivo
	transiciones []string
	requests     int
}

func nuevoStubAuditApp(t *testing.T) (*stubAuditApp, string) {
	t.Helper()
	s := &stubAuditApp{
		token:        "tok-integracion",
		escaneoID:    "11111111-2222-3333-4444-555555555555",
		estado:       "pendiente",
		dispositivos: map[string]map[string]any{},
	}
	srv := &http.Server{Handler: s}
	lis, err := listenLocal()
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	go func() { _ = srv.Serve(lis) }()
	t.Cleanup(func() { _ = srv.Close() })
	return s, "http://" + lis.Addr().String()
}

func (s *stubAuditApp) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.requests++

	w.Header().Set("Content-Type", "application/json")

	// Guard del contrato #60: Bearer + X-Agente-Version semver major 1.
	if r.Header.Get("Authorization") != "Bearer "+s.token {
		w.WriteHeader(401)
		_ = json.NewEncoder(w).Encode(map[string]any{"success": false, "data": nil, "error": "No autorizado"})
		return
	}
	version := r.Header.Get("X-Agente-Version")
	if version == "" {
		w.WriteHeader(400)
		_ = json.NewEncoder(w).Encode(map[string]any{"success": false, "data": nil, "error": "Header X-Agente-Version requerido"})
		return
	}
	if !strings.HasPrefix(version, "1.") && !strings.HasPrefix(version, "0.") {
		w.WriteHeader(409)
		_ = json.NewEncoder(w).Encode(map[string]any{"success": false, "data": nil, "error": "Versión del agente incompatible: actualice el agente"})
		return
	}

	prefijo := "/api/escaneos/" + s.escaneoID
	if !strings.HasPrefix(r.URL.Path, prefijo) {
		w.WriteHeader(404)
		_ = json.NewEncoder(w).Encode(map[string]any{"success": false, "data": nil, "error": "Escaneo no encontrado"})
		return
	}

	switch {
	case r.Method == http.MethodGet && r.URL.Path == prefijo:
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"data": map[string]any{
				"estado":                 s.estado,
				"dispositivosDetectados": len(s.dispositivos),
				"consentimientoOtorgado": s.consentido,
				"etiqueta":               "VLAN test",
				"rangoObjetivo":          "172.30.0.0/24",
				"empresa":                "Laboratorio SyS",
				"auditoria":              "Auditoría de integración",
			},
			"error": nil,
		})

	case r.Method == http.MethodPost && r.URL.Path == prefijo+"/consentimiento":
		s.consentido = true
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}, "error": nil})

	case r.Method == http.MethodPost && r.URL.Path == prefijo+"/dispositivos":
		var body struct {
			Dispositivos []map[string]any `json:"dispositivos"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			w.WriteHeader(400)
			_ = json.NewEncoder(w).Encode(map[string]any{"success": false, "data": nil, "error": "JSON inválido"})
			return
		}
		if len(body.Dispositivos) == 0 || len(body.Dispositivos) > 100 {
			w.WriteHeader(400)
			_ = json.NewEncoder(w).Encode(map[string]any{"success": false, "data": nil, "error": "chunk fuera de rango"})
			return
		}
		for _, d := range body.Dispositivos {
			// Upsert por identidad determinística: MAC si hay, si no IP (R12 de #59)
			identidad, _ := d["ip"].(string)
			if mac, ok := d["mac"].(string); ok && mac != "" {
				identidad = mac
			}
			s.dispositivos[identidad] = d
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"data":    map[string]any{"recibidos": len(body.Dispositivos)},
			"error":   nil,
		})

	case r.Method == http.MethodPost && r.URL.Path == prefijo+"/estado":
		var body struct {
			Estado string `json:"estado"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		s.estado = body.Estado
		s.transiciones = append(s.transiciones, body.Estado)
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{"estado": s.estado}, "error": nil})

	default:
		w.WriteHeader(404)
		_ = json.NewEncoder(w).Encode(map[string]any{"success": false, "data": nil, "error": "no encontrado"})
	}
}
