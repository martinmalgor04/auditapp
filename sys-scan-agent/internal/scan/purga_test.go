package scan

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/serviciosysistemas/sys-scan-agent/internal/creds"
	"github.com/serviciosysistemas/sys-scan-agent/internal/dockerx"
	"github.com/serviciosysistemas/sys-scan-agent/internal/logx"
	"github.com/serviciosysistemas/sys-scan-agent/internal/nmaphost"
	"github.com/serviciosysistemas/sys-scan-agent/internal/normalize"
	"github.com/serviciosysistemas/sys-scan-agent/internal/openaudit"
	"github.com/serviciosysistemas/sys-scan-agent/internal/queue"
	syncapi "github.com/serviciosysistemas/sys-scan-agent/internal/sync"
)

// fakeOALogger simula un descuido típico: loguea las credenciales que recibe
// (la defensa de R11 tiene que redactarlas igual).
type fakeOALogger struct {
	fakeOA
	log *slog.Logger
}

func (f *fakeOALogger) CrearCredenciales(ctx context.Context, lista []creds.Credencial) ([]string, error) {
	for _, c := range lista {
		// Descuido deliberado para el test: loguear el payload con secretos.
		f.log.Info("cargando credencial en Open-AudIT",
			"nombre", c.Nombre, "usuario", c.Usuario, "password", c.Password, "community", c.Community)
	}
	return f.fakeOA.CrearCredenciales(ctx, lista)
}

// Verificación automatizada de artefactos post-cierre (R10/R11): tras un
// escaneo completo, ninguna credencial queda en keychain, Open-AudIT,
// contenedor NI LOGS — aunque una dependencia las loguee por descuido.
func TestPurgaCompletaSinRastroDeCredenciales(t *testing.T) {
	// Logger real con redacción (logx) escribiendo a buffer inspeccionable.
	var buf bytes.Buffer
	handler := logx.NewHandler(slog.NewJSONHandler(&buf, nil))
	logger := slog.New(handler)

	// Secretos registrados como hace app.IniciarEscaneo (R11)
	handler.RegistrarSecreto("Cl4ve-WMI-del-Cliente")
	handler.RegistrarSecreto("snmp-s3cr3t-community")

	cola, err := queue.Open(t.TempDir() + "/cola.db")
	if err != nil {
		t.Fatalf("queue.Open: %v", err)
	}
	t.Cleanup(func() { _ = cola.Close() })

	norm, err := normalize.New(slog.New(slog.NewJSONHandler(io.Discard, nil)))
	if err != nil {
		t.Fatalf("normalize.New: %v", err)
	}

	fs := &fakeSync{estado: &syncapi.EstadoEscaneo{
		Estado: "pendiente", RangoObjetivo: "192.168.10.0/24", Empresa: "Acme", Auditoria: "A",
	}}
	foa := &fakeOALogger{fakeOA: fakeOA{devices: []openaudit.OADevice{device("192.168.10.10", "computer")}}, log: logger}
	fc := &fakeCreds{}
	fd := &fakeDocker{cont: &dockerx.Contenedor{ID: "cont-purga", Nombre: "sys-scan-purga", PuertoHost: 9997}}

	orq := Nuevo(Deps{
		NuevoSync: func(context.Context, string) (SyncClient, *syncapi.EstadoEscaneo, error) {
			return fs, fs.estado, nil
		},
		Docker:       fd,
		NuevoOA:      func(*dockerx.Contenedor) OpenAuditClient { return foa },
		Nmap:         &fakeNmap{disponible: true, tabla: map[string]nmaphost.EntradaARP{}},
		Normalizador: norm,
		Cola:         cola,
		Creds:        fc,
		Log:          logger,
		Esperar:      func(context.Context, time.Duration) error { return nil },
	})

	ctx := context.Background()
	if _, err := orq.Preparar(ctx, "tok"); err != nil {
		t.Fatalf("Preparar: %v", err)
	}
	err = orq.Iniciar(ctx, "esc-purga", []creds.Credencial{
		{Nombre: "wmi", Tipo: creds.TipoWindows, Usuario: "ACME\\admin", Password: "Cl4ve-WMI-del-Cliente"},
		{Nombre: "snmp", Tipo: creds.TipoSNMP, Community: "snmp-s3cr3t-community"},
	}, "María Pérez")
	if err != nil {
		t.Fatalf("Iniciar: %v", err)
	}
	esperarFase(t, orq, FaseCompletado)

	// 1. Keychain sin claves del escaneo (R10)
	if restantes, _ := fc.Leer("esc-purga"); len(restantes) != 0 {
		t.Fatalf("quedaron credenciales en el keychain: %+v", restantes)
	}
	// 2. Open-AudIT recibió el borrado de todas las credenciales cargadas (R10)
	if len(foa.borradas) != 2 {
		t.Fatalf("no se borraron todas las credenciales de OA: %v", foa.borradas)
	}
	// 3. Contenedor detenido (con --rm se destruye con su DB interna)
	if len(fd.detenidos) != 1 || fd.detenidos[0] != "cont-purga" {
		t.Fatalf("el contenedor no fue detenido: %v", fd.detenidos)
	}
	// 4. Logs sin secretos (R11) — aunque el fake los logueó a propósito
	logs := buf.String()
	for _, secreto := range []string{"Cl4ve-WMI-del-Cliente", "snmp-s3cr3t-community"} {
		if strings.Contains(logs, secreto) {
			t.Fatalf("el log contiene el secreto %q", secreto)
		}
	}
	// El usuario NO sensible sí puede quedar en logs
	if !strings.Contains(logs, "ACME") {
		t.Fatalf("el redactor se llevó puesto un campo no sensible")
	}
}
