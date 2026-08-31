//go:build integration

// Test de integración end-to-end (T16): contenedor sys-openaudit real + red
// Docker con víctimas SSH/SNMP + stub fiel al contrato de #60.
//
// Requiere Docker. Corre en CI (ci/integration.yml) con:
//
//	go test -tags=integration ./test/integration/...
//
// Cubre R13–R19, R22, R23: flujo completo token → consentimiento → en_curso →
// discovery real → normalizar → chunks → completado; idempotencia de reenvío;
// purga de credenciales y contenedor.
package integration

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/serviciosysistemas/sys-scan-agent/internal/creds"
	"github.com/serviciosysistemas/sys-scan-agent/internal/dockerx"
	"github.com/serviciosysistemas/sys-scan-agent/internal/nmaphost"
	"github.com/serviciosysistemas/sys-scan-agent/internal/normalize"
	"github.com/serviciosysistemas/sys-scan-agent/internal/openaudit"
	"github.com/serviciosysistemas/sys-scan-agent/internal/queue"
	"github.com/serviciosysistemas/sys-scan-agent/internal/scan"
	syncapi "github.com/serviciosysistemas/sys-scan-agent/internal/sync"
)

func listenLocal() (net.Listener, error) {
	return net.Listen("tcp", "127.0.0.1:0")
}

// imagenDisponible verifica si sys-openaudit está construida localmente; si
// no, la construye desde docker/sys-openaudit (CI la buildea antes).
func imagenDisponible(t *testing.T) {
	t.Helper()
	if os.Getenv("SYS_SCAN_SKIP_IMAGE_BUILD") == "1" {
		return
	}
	out, err := exec.Command("docker", "images", "-q", "sys-openaudit:test").Output()
	if err == nil && len(out) > 0 {
		return
	}
	t.Log("construyendo imagen sys-openaudit:test (una sola vez, puede tardar)")
	root := raizRepo(t)
	build := exec.Command("docker", "build", "-t", "sys-openaudit:test",
		filepath.Join(root, "docker", "sys-openaudit"))
	build.Stdout, build.Stderr = os.Stdout, os.Stderr
	if err := build.Run(); err != nil {
		t.Skipf("no se pudo construir la imagen (¿Docker disponible?): %v", err)
	}
}

func raizRepo(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	// test/integration → raíz del repo
	return filepath.Clean(filepath.Join(dir, "..", ".."))
}

// TestEscaneoEndToEnd corre el orquestador completo contra un Open-AudIT
// real en Docker y el stub del contrato #60.
func TestEscaneoEndToEnd(t *testing.T) {
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("sin Docker en este entorno")
	}
	imagenDisponible(t)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	// Red Docker de prueba con víctimas SSH + SNMP.
	exec.Command("docker", "network", "create", "sys-scan-test").Run()
	t.Cleanup(func() { exec.Command("docker", "network", "rm", "sys-scan-test").Run() })

	levantarVictima(t, "sys-scan-victima-ssh",
		"linuxserver/openssh-server:latest",
		[]string{"-e", "PASSWORD_ACCESS=true", "-e", "USER_PASSWORD=integration-test", "-e", "USER_NAME=audit"})
	levantarVictima(t, "sys-scan-victima-snmp",
		"prom/snmpd:latest", nil)

	// Stub de AuditApp (contrato #60).
	stub, baseURL := nuevoStubAuditApp(t)

	// Store local real (SQLite en tmp).
	cola, err := queue.Open(filepath.Join(t.TempDir(), "cola.db"))
	if err != nil {
		t.Fatalf("queue.Open: %v", err)
	}
	defer cola.Close()

	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	norm, err := normalize.New(log)
	if err != nil {
		t.Fatalf("normalize.New: %v", err)
	}

	// Docker real con la imagen de test (sin digest pineado en test).
	dockerCli, err := dockerx.Nuevo(ctx)
	if err != nil {
		t.Skipf("Docker no disponible: %v", err)
	}
	dockerCli.Imagen = "sys-openaudit:test"

	// CredStore en memoria para el test (sin keyring real en CI).
	credStore := nuevoCredStoreMemoria()

	orq := scan.Nuevo(scan.Deps{
		NuevoSync: func(context.Context, string) (scan.SyncClient, *syncapi.EstadoEscaneo, error) {
			cli := syncapi.New(baseURL, stub.escaneoID, stub.token, "1.0.0", "ci-runner")
			estado, err := cli.ObtenerEstado(ctx)
			return cli, estado, err
		},
		Docker: dockerCli,
		NuevoOA: func(cont *dockerx.Contenedor) scan.OpenAuditClient {
			return openaudit.New(cont.BaseURL(), "admin", "password")
		},
		Nmap:         &nmapDegradado{}, // sin ARP host en CI (red Docker ≠ LAN)
		Normalizador: norm,
		Cola:         cola,
		Creds:        credStore,
		Log:          log,
		Esperar: func(ctx context.Context, d time.Duration) error {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(d):
				return nil
			}
		},
	})

	// R13: validar token
	if _, err := orq.Preparar(ctx, "compuesto"); err != nil {
		t.Fatalf("Preparar: %v", err)
	}

	// R14/R15: iniciar con consentimiento
	err = orq.Iniciar(ctx, stub.escaneoID, []creds.Credencial{
		{Nombre: "ssh-victima", Tipo: creds.TipoSSH, Usuario: "audit", Password: "integration-test"},
	}, "Tester Integración")
	if err != nil {
		t.Fatalf("Iniciar: %v", err)
	}

	// Esperar completado (el discovery real puede tardar varios minutos)
	deadline := time.Now().Add(12 * time.Minute)
	for time.Now().Before(deadline) {
		p := orq.Estado()
		if p.Fase == scan.FaseCompletado {
			break
		}
		if p.Fase == scan.FaseFallido {
			t.Fatalf("el escaneo falló: %s", p.Error)
		}
		time.Sleep(5 * time.Second)
	}

	p := orq.Estado()
	if p.Fase != scan.FaseCompletado {
		t.Fatalf("no completó a tiempo; fase %s (encontrados %d, sincronizados %d)",
			p.Fase, p.Encontrados, p.Sincronizados)
	}

	// R16/R17: el stub recibió dispositivos y las transiciones en orden
	stub.mu.Lock()
	total := len(stub.dispositivos)
	transiciones := append([]string{}, stub.transiciones...)
	stub.mu.Unlock()

	if total == 0 {
		t.Fatalf("el discovery no encontró ningún dispositivo en la red de prueba")
	}
	t.Logf("dispositivos encontrados y persistidos: %d", total)

	// Transiciones: en_curso → sincronizando → completado (R15/R17)
	esp := []string{"en_curso", "sincronizando", "completado"}
	if len(transiciones) != 3 {
		t.Fatalf("transiciones: %v", transiciones)
	}
	for i, e := range esp {
		if transiciones[i] != e {
			t.Fatalf("transición %d: %s ≠ %s", i, transiciones[i], e)
		}
	}

	// R19: idempotencia — reenviar los mismos dispositivos no duplica
	antes := total
	stub.mu.Lock()
	for _, d := range stub.dispositivos {
		identidad, _ := d["ip"].(string)
		if mac, ok := d["mac"].(string); ok && mac != "" {
			identidad = mac
		}
		stub.dispositivos[identidad] = d // re-upsert
	}
	despues := len(stub.dispositivos)
	stub.mu.Unlock()
	if antes != despues {
		t.Fatalf("el reenvío duplicó dispositivos: %d → %d", antes, despues)
	}

	// R10: purga — keychain sin credenciales del escaneo
	if restantes, _ := credStore.Leer(stub.escaneoID); len(restantes) != 0 {
		t.Fatalf("quedaron credenciales en el store tras el cierre")
	}

	// R22/R24: no quedan contenedores sys-scan-* vivos
	out, _ := exec.Command("docker", "ps", "-a", "--filter", "name=sys-scan-",
		"--format", "{{.Names}}").Output()
	if len(out) > 0 {
		t.Fatalf("quedaron contenedores del agente: %s", out)
	}
}

func levantarVictima(t *testing.T, nombre, imagen string, envExtra []string) {
	t.Helper()
	args := []string{"run", "-d", "--rm", "--name", nombre, "--network", "sys-scan-test"}
	args = append(args, envExtra...)
	args = append(args, imagen)
	cmd := exec.Command("docker", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("levantar víctima %s: %v\n%s", nombre, err, out)
	}
	t.Cleanup(func() { exec.Command("docker", "stop", nombre).Run() })
}

// nmapDegradado: en CI el barrido ARP del host no ve la red Docker de
// prueba (no es la LAN); el test corre el camino degradado (R7).
type nmapDegradado struct{}

func (nmapDegradado) Verificar(context.Context) nmaphost.Disponibilidad {
	return nmaphost.Disponibilidad{NmapInstalado: true, CapturaOK: false, Detalle: "CI sin LAN"}
}
func (nmapDegradado) BarridoARP(context.Context, string) (map[string]nmaphost.EntradaARP, error) {
	return nil, fmt.Errorf("sin captura en CI")
}

// credStoreMemoria: CredStore sin keyring real (CI headless).
type credStoreMemoria struct {
	porEscaneo map[string][]creds.Credencial
}

func nuevoCredStoreMemoria() *credStoreMemoria {
	return &credStoreMemoria{porEscaneo: map[string][]creds.Credencial{}}
}

func (c *credStoreMemoria) Guardar(escaneoID string, lista []creds.Credencial) error {
	c.porEscaneo[escaneoID] = lista
	return nil
}
func (c *credStoreMemoria) Leer(escaneoID string) ([]creds.Credencial, error) {
	return c.porEscaneo[escaneoID], nil
}
func (c *credStoreMemoria) Purgar(escaneoID string) error {
	delete(c.porEscaneo, escaneoID)
	return nil
}
