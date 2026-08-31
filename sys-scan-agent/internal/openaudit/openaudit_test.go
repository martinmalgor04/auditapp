package openaudit

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/serviciosysistemas/sys-scan-agent/internal/creds"
)

// stubOA simula la API de Open-AudIT 6.x.
func stubOA(t *testing.T, handler http.HandlerFunc) (*httptest.Server, *Client) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, p, ok := r.BasicAuth()
		if !ok || u != "admin" || p != "password" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		handler(w, r)
	}))
	t.Cleanup(srv.Close)
	return srv, New(srv.URL, "admin", "password")
}

func TestCrearCredencialesMapeaTipos(t *testing.T) {
	var bodies []map[string]any
	_, cli := stubOA(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/credentials" {
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			bodies = append(bodies, body)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": map[string]any{"id": len(bodies), "type": "credentials"},
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	})

	ids, err := cli.CrearCredenciales(context.Background(), []creds.Credencial{
		{Nombre: "wmi", Tipo: creds.TipoWindows, Usuario: "D\\admin", Password: "x"},
		{Nombre: "snmp", Tipo: creds.TipoSNMP, Community: "public"},
		{Nombre: "snmp3", Tipo: creds.TipoSNMPv3, Usuario: "u3", AuthProtocol: "SHA", AuthPassphrase: "ap", PrivProtocol: "AES", PrivPassphrase: "pp"},
	})
	if err != nil {
		t.Fatalf("CrearCredenciales: %v", err)
	}
	if len(ids) != 3 || ids[0] != "1" || ids[2] != "3" {
		t.Fatalf("ids mal normalizados: %v", ids)
	}

	attrs := func(i int) map[string]any {
		return bodies[i]["data"].(map[string]any)["attributes"].(map[string]any)
	}
	// windows: username/password
	if attrs(0)["type"] != "windows" {
		t.Fatalf("tipo windows mal mapeado: %v", attrs(0)["type"])
	}
	credW := attrs(0)["credentials"].(map[string]any)
	if credW["username"] != "D\\admin" || credW["password"] != "x" {
		t.Fatalf("credenciales windows mal mapeadas: %v", credW)
	}
	// snmp: community
	credS := attrs(1)["credentials"].(map[string]any)
	if credS["community"] != "public" {
		t.Fatalf("community mal mapeada: %v", credS)
	}
	// snmp_v3: campos USM
	cred3 := attrs(2)["credentials"].(map[string]any)
	if cred3["security_name"] != "u3" || cred3["authentication_passphrase"] != "ap" || cred3["privacy_passphrase"] != "pp" {
		t.Fatalf("snmp_v3 mal mapeado: %v", cred3)
	}
}

func TestBorrarCredencialesIntentaTodas(t *testing.T) {
	var borradas []string
	_, cli := stubOA(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/credentials/") {
			id := strings.TrimPrefix(r.URL.Path, "/credentials/")
			if id == "2" {
				w.WriteHeader(http.StatusInternalServerError) // falla una
				return
			}
			borradas = append(borradas, id)
			_ = json.NewEncoder(w).Encode(map[string]any{"data": nil})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	})

	err := cli.BorrarCredenciales(context.Background(), []string{"1", "2", "3"})
	if err == nil {
		t.Fatalf("debería reportar la credencial que falló")
	}
	if len(borradas) != 2 {
		t.Fatalf("debería haber intentado todas: %v", borradas)
	}
}

func TestEjecutarDiscoveryCreaYLanza(t *testing.T) {
	var creado bool
	var ejecutado string
	_, cli := stubOA(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/discoveries":
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			attrs := body["data"].(map[string]any)["attributes"].(map[string]any)
			if attrs["type"] != "subnet" || attrs["subnet"] != "192.168.10.0/24" {
				t.Errorf("discovery mal armado: %v", attrs)
			}
			creado = true
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"id": 42}})
		case r.Method == http.MethodGet && r.URL.Path == "/discoveries/42/execute":
			ejecutado = "42"
			_ = json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{}})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})

	id, err := cli.EjecutarDiscovery(context.Background(), "192.168.10.0/24")
	if err != nil {
		t.Fatalf("EjecutarDiscovery: %v", err)
	}
	if !creado || ejecutado != "42" || id != "42" {
		t.Fatalf("flujo incompleto: creado=%v ejecutado=%q id=%q", creado, ejecutado, id)
	}
}

func TestEstadoDiscovery(t *testing.T) {
	_, cli := stubOA(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{
				"id":         "7",
				"attributes": map[string]any{"status": "running"},
			},
		})
	})

	est, err := cli.EstadoDiscovery(context.Background(), "7")
	if err != nil {
		t.Fatalf("EstadoDiscovery: %v", err)
	}
	if est.Status != "running" {
		t.Fatalf("status inesperado: %q", est.Status)
	}
}

func TestDispositivosPaginadoYRaw(t *testing.T) {
	_, cli := stubOA(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/devices" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.URL.Query().Get("include") != includesDevice {
			t.Errorf("faltan includes: %s", r.URL.Query().Get("include"))
		}
		offset := r.URL.Query().Get("offset")
		dev := func(id int, ip string) map[string]any {
			return map[string]any{
				"id":   id,
				"type": "devices",
				"attributes": map[string]any{
					"ip": ip, "hostname": "host", "type": "computer",
				},
				"included": map[string]any{
					"nmap": []map[string]any{{"port": 445, "protocol": "tcp", "name": "microsoft-ds"}},
				},
			}
		}
		var data []map[string]any
		if offset == "0" {
			for i := 1; i <= 100; i++ {
				data = append(data, dev(i, "192.168.10.1"))
			}
		} else {
			data = append(data, dev(101, "192.168.10.101"))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": data,
			"meta": map[string]any{"total": 101},
		})
	})

	dispositivos, err := cli.Dispositivos(context.Background())
	if err != nil {
		t.Fatalf("Dispositivos: %v", err)
	}
	if len(dispositivos) != 101 {
		t.Fatalf("paginado incompleto: %d devices", len(dispositivos))
	}
	ultimo := dispositivos[100]
	if ultimo.Attributes["ip"] != "192.168.10.101" {
		t.Fatalf("atributos mal parseados: %v", ultimo.Attributes)
	}
	if len(ultimo.Included["nmap"]) != 1 {
		t.Fatalf("colección nmap ausente: %v", ultimo.Included)
	}
	// Raw conserva el payload original (R14 de #59)
	if ultimo.Raw["attributes"] == nil || ultimo.Raw["included"] == nil {
		t.Fatalf("raw incompleto: %v", ultimo.Raw)
	}
}

func TestEsperarListoTimeout(t *testing.T) {
	// Server que nunca responde OK
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	t.Cleanup(srv.Close)

	cli := New(srv.URL, "admin", "password")
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()

	if err := cli.EsperarListo(ctx); err != ErrNoListo {
		t.Fatalf("esperaba ErrNoListo, vino %v", err)
	}
}
