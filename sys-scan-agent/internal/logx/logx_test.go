package logx

import (
	"bytes"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRedactaCamposSensibles(t *testing.T) {
	var buf bytes.Buffer
	h := NewHandler(slog.NewJSONHandler(&buf, nil))
	log := slog.New(h)

	log.Info("cargando credenciales",
		"usuario", "admin",
		"password", "secreto123",
		"community", "public",
		"token", "tok-abc",
		"authPassphrase", "frase-secreta",
	)

	salida := buf.String()
	for _, prohibido := range []string{"secreto123", "public", "tok-abc", "frase-secreta"} {
		if strings.Contains(salida, prohibido) {
			t.Fatalf("el log contiene %q: %s", prohibido, salida)
		}
	}
	if !strings.Contains(salida, "admin") {
		t.Fatalf("el log perdió campos no sensibles: %s", salida)
	}
}

func TestRedactaValoresRegistradosEnMensajesLibres(t *testing.T) {
	var buf bytes.Buffer
	h := NewHandler(slog.NewJSONHandler(&buf, nil))
	log := slog.New(h)

	h.RegistrarSecreto("Cl4veDelCliente!")
	log.Info("respuesta de Open-AudIT: {\"credentials\":{\"password\":\"Cl4veDelCliente!\"}}")

	if strings.Contains(buf.String(), "Cl4veDelCliente!") {
		t.Fatalf("el log contiene el secreto dentro del mensaje: %s", buf.String())
	}
}

func TestRedactaEnWithAttrs(t *testing.T) {
	var buf bytes.Buffer
	h := NewHandler(slog.NewJSONHandler(&buf, nil))
	log := slog.New(h).With("token", "tok-secreto", "escaneo", "esc-1")

	log.Info("procesando")

	salida := buf.String()
	if strings.Contains(salida, "tok-secreto") {
		t.Fatalf("WithAttrs no redactó: %s", salida)
	}
	if !strings.Contains(salida, "esc-1") {
		t.Fatalf("WithAttrs perdió campos normales: %s", salida)
	}
}

func TestIgnoraSecretosCortos(t *testing.T) {
	var buf bytes.Buffer
	h := NewHandler(slog.NewJSONHandler(&buf, nil))
	log := slog.New(h)

	// "abc" (< 4 chars) no se registra para no destruir logs con falsos positivos
	h.RegistrarSecreto("abc")
	log.Info("prefijo abc de prueba")

	if !strings.Contains(buf.String(), "abc") {
		t.Fatalf("un secreto corto no debería redactarse: %s", buf.String())
	}
}

func TestOlvidarSecretos(t *testing.T) {
	var buf bytes.Buffer
	h := NewHandler(slog.NewJSONHandler(&buf, nil))
	log := slog.New(h)

	h.RegistrarSecreto("secreto-del-escaneo")
	h.OlvidarSecretos()
	log.Info("menciono secreto-del-escaneo tras purgar")

	if !strings.Contains(buf.String(), "secreto-del-escaneo") {
		t.Fatalf("tras OlvidarSecretos no debería redactarse: %s", buf.String())
	}
}

func TestRotacionDeArchivos(t *testing.T) {
	dir := t.TempDir()
	log, _, closer, err := New(Config{Dir: dir, MaxBytes: 256, MaxBackups: 3})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer closer.Close()

	// Escribir suficiente para forzar varias rotaciones
	for i := 0; i < 40; i++ {
		log.Info("línea de prueba para llenar el archivo de log del agente", "i", i)
	}
	_ = closer.Close()

	// Debe existir el activo + como máximo 3 backups
	for _, nombre := range []string{"agente.log", "agente.log.1", "agente.log.2", "agente.log.3"} {
		if _, err := os.Stat(filepath.Join(dir, nombre)); err != nil {
			t.Fatalf("falta %s tras rotar: %v", nombre, err)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "agente.log.4")); !os.IsNotExist(err) {
		t.Fatalf("hay más backups que MaxBackups")
	}
}
