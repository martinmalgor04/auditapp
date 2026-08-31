package update

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestEsMasNueva(t *testing.T) {
	casos := []struct {
		actual, publicada string
		esperado          bool
	}{
		{"1.0.0", "1.0.1", true},
		{"1.0.0", "1.1.0", true},
		{"1.0.0", "2.0.0", true},
		{"1.2.3", "1.2.3", false},
		{"1.2.3", "1.2.2", false},
		{"2.0.0", "1.9.9", false},
		{"dev", "1.0.0", true},        // build dev: siempre avisa
		{"1.0.0", "no-semver", false}, // publicada inválida: no avisar
		{"1.0.0", "v1.1.0", true},     // tolera prefijo v
		{"1.0.0-beta.1", "1.0.0", true},
	}
	for _, c := range casos {
		if got := EsMasNueva(c.actual, c.publicada); got != c.esperado {
			t.Fatalf("EsMasNueva(%q, %q) = %v, esperado %v", c.actual, c.publicada, got, c.esperado)
		}
	}
}

func TestChequearConVersionNueva(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/agente/version.json" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"version": "1.1.0",
			"urlWindows": "https://example.com/win.exe",
			"urlMac": "https://example.com/mac.dmg"
		}`))
	}))
	t.Cleanup(srv.Close)

	aviso := Chequear(context.Background(), srv.URL, "1.0.0")
	if aviso == nil {
		t.Fatalf("debería avisar de la 1.1.0")
	}
	if aviso.VersionNueva != "1.1.0" || aviso.URLMac == "" {
		t.Fatalf("aviso incompleto: %+v", aviso)
	}
}

func TestChequearSinVersionNueva(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"version":"1.0.0","urlWindows":"x","urlMac":"y"}`))
	}))
	t.Cleanup(srv.Close)

	if aviso := Chequear(context.Background(), srv.URL, "1.0.0"); aviso != nil {
		t.Fatalf("no debería avisar con la misma versión")
	}
}

func TestChequearSinConectividadNoFalla(t *testing.T) {
	// URL inalcanzable: nil sin pánico ni error visible
	if aviso := Chequear(context.Background(), "http://127.0.0.1:1", "1.0.0"); aviso != nil {
		t.Fatalf("sin conectividad no debería avisar")
	}
}

func TestChequearJSONInvalidoNoFalla(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`no es json`))
	}))
	t.Cleanup(srv.Close)

	if aviso := Chequear(context.Background(), srv.URL, "1.0.0"); aviso != nil {
		t.Fatalf("JSON inválido no debería avisar")
	}
}
