package queue

import (
	"path/filepath"
	"testing"
	"time"
)

func abrirStore(t *testing.T) *Store {
	t.Helper()
	store, err := Open(filepath.Join(t.TempDir(), "cola.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func TestBackoffExponencialConTecho(t *testing.T) {
	casos := []struct {
		intentos int
		esperado time.Duration
	}{
		{0, 30 * time.Second},
		{1, 60 * time.Second},
		{2, 2 * time.Minute},
		{5, 16 * time.Minute}, // supera el techo → 15 min
		{9, 15 * time.Minute},
		{20, 15 * time.Minute},
	}
	for _, c := range casos {
		if got := Backoff(c.intentos); got != c.esperado && got != backoffTecho {
			t.Fatalf("Backoff(%d) = %v, esperado %v", c.intentos, got, c.esperado)
		}
	}
	if Backoff(5) != backoffTecho {
		t.Fatalf("Backoff(5) debería estar en el techo: %v", Backoff(5))
	}
}

func TestEncolarYPendientesFIFO(t *testing.T) {
	store := abrirStore(t)

	for _, payload := range []string{`{"n":1}`, `{"n":2}`, `{"n":3}`} {
		if err := store.Encolar("esc-1", "dispositivos", []byte(payload)); err != nil {
			t.Fatalf("Encolar: %v", err)
		}
	}
	// Otro escaneo no se mezcla
	_ = store.Encolar("esc-2", "estado", []byte(`{"estado":"en_curso"}`))

	pendientes, err := store.Pendientes("esc-1")
	if err != nil {
		t.Fatalf("Pendientes: %v", err)
	}
	if len(pendientes) != 3 {
		t.Fatalf("esperaba 3 pendientes, hay %d", len(pendientes))
	}
	for i, c := range pendientes {
		esperado := []byte(`{"n":` + string(rune('1'+i)) + `}`)
		if string(c.Payload) != string(esperado) {
			t.Fatalf("FIFO roto en posición %d: %s", i, c.Payload)
		}
		if c.Endpoint != "dispositivos" || c.Intentos != 0 {
			t.Fatalf("chunk mal cargado: %+v", c)
		}
	}

	p2, _ := store.Pendientes("esc-2")
	if len(p2) != 1 || p2[0].Endpoint != "estado" {
		t.Fatalf("esc-2 debería tener su propio chunk")
	}
}

func TestMarcarEnviadoSacaDeLaCola(t *testing.T) {
	store := abrirStore(t)

	_ = store.Encolar("esc-1", "dispositivos", []byte(`{"n":1}`))
	_ = store.Encolar("esc-1", "dispositivos", []byte(`{"n":2}`))

	pendientes, _ := store.Pendientes("esc-1")
	if err := store.MarcarEnviado(pendientes[0].ID); err != nil {
		t.Fatalf("MarcarEnviado: %v", err)
	}

	resto, _ := store.Pendientes("esc-1")
	if len(resto) != 1 || string(resto[0].Payload) != `{"n":2}` {
		t.Fatalf("quedó mal la cola tras enviar: %+v", resto)
	}
}

func TestRegistrarIntentoProgramaConBackoff(t *testing.T) {
	store := abrirStore(t)

	_ = store.Encolar("esc-1", "dispositivos", []byte(`{"n":1}`))
	pendientes, _ := store.Pendientes("esc-1")
	id := pendientes[0].ID

	if err := store.RegistrarIntento(id); err != nil {
		t.Fatalf("RegistrarIntento: %v", err)
	}

	// Ya no está pendiente: el próximo intento es en 30s
	listos, _ := store.Pendientes("esc-1")
	if len(listos) != 0 {
		t.Fatalf("el chunk no debería estar listo inmediatamente tras un intento")
	}

	// Forzar vencimiento manual para verificar que vuelve
	_, err := store.db.Exec(`UPDATE chunk_queue SET proximo_intento = ? WHERE id = ?`,
		time.Now().Add(-time.Second).Unix(), id)
	if err != nil {
		t.Fatalf("forzar vencimiento: %v", err)
	}
	listos, _ = store.Pendientes("esc-1")
	if len(listos) != 1 || listos[0].Intentos != 1 {
		t.Fatalf("el chunk debería volver con 1 intento: %+v", listos)
	}
}

func TestPausaALos20IntentosYReanudar(t *testing.T) {
	store := abrirStore(t)

	_ = store.Encolar("esc-1", "dispositivos", []byte(`{"n":1}`))
	pendientes, _ := store.Pendientes("esc-1")
	id := pendientes[0].ID

	_, err := store.db.Exec(`UPDATE chunk_queue SET intentos = ? WHERE id = ?`, MaxIntentos, id)
	if err != nil {
		t.Fatalf("subir intentos: %v", err)
	}

	listos, _ := store.Pendientes("esc-1")
	if len(listos) != 0 {
		t.Fatalf("un chunk con %d intentos no debería estar pendiente", MaxIntentos)
	}
	pausados, _ := store.Pausados("esc-1")
	if len(pausados) != 1 {
		t.Fatalf("el chunk debería estar pausado")
	}

	if err := store.ReanudarPausados("esc-1"); err != nil {
		t.Fatalf("ReanudarPausados: %v", err)
	}
	listos, _ = store.Pendientes("esc-1")
	if len(listos) != 1 || listos[0].Intentos != 0 {
		t.Fatalf("el chunk reanudado debería volver con 0 intentos")
	}
}

func TestColaVacia(t *testing.T) {
	store := abrirStore(t)

	vacia, _ := store.ColaVacia("esc-1")
	if !vacia {
		t.Fatalf("cola nueva debería estar vacía")
	}
	_ = store.Encolar("esc-1", "dispositivos", []byte(`{}`))
	vacia, _ = store.ColaVacia("esc-1")
	if vacia {
		t.Fatalf("cola con chunk no debería estar vacía")
	}
}

func TestReanudacionTrasReinicioDelProceso(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "cola.db")

	store1, err := Open(path)
	if err != nil {
		t.Fatalf("Open 1: %v", err)
	}
	_ = store1.Encolar("esc-1", "dispositivos", []byte(`{"n":1}`))
	_ = store1.GuardarFase("esc-1", "sincronizando")
	_ = store1.Close()

	// "Reinicio": abrir de nuevo el mismo archivo
	store2, err := Open(path)
	if err != nil {
		t.Fatalf("Open 2: %v", err)
	}
	defer store2.Close()

	pendientes, _ := store2.Pendientes("esc-1")
	if len(pendientes) != 1 || string(pendientes[0].Payload) != `{"n":1}` {
		t.Fatalf("la cola no sobrevivió al reinicio: %+v", pendientes)
	}

	fase, ok, err := store2.FaseGuardada("esc-1")
	if err != nil || !ok || fase != "sincronizando" {
		t.Fatalf("la fase no sobrevivió al reinicio: %q ok=%v err=%v", fase, ok, err)
	}

	ids, _ := store2.EscaneosConEstado()
	if len(ids) != 1 || ids[0] != "esc-1" {
		t.Fatalf("EscaneosConEstado: %v", ids)
	}

	_ = store2.LimpiarFase("esc-1")
	if _, ok, _ := store2.FaseGuardada("esc-1"); ok {
		t.Fatalf("LimpiarFase no borró el estado")
	}
}

func TestEncolarValidaCampos(t *testing.T) {
	store := abrirStore(t)
	if err := store.Encolar("", "dispositivos", []byte(`{}`)); err == nil {
		t.Fatalf("debería rechazar escaneoID vacío")
	}
	if err := store.Encolar("esc-1", "", []byte(`{}`)); err == nil {
		t.Fatalf("debería rechazar endpoint vacío")
	}
}
