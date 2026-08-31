package scan

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/serviciosysistemas/sys-scan-agent/internal/creds"
	"github.com/serviciosysistemas/sys-scan-agent/internal/dockerx"
	"github.com/serviciosysistemas/sys-scan-agent/internal/nmaphost"
	"github.com/serviciosysistemas/sys-scan-agent/internal/normalize"
	"github.com/serviciosysistemas/sys-scan-agent/internal/openaudit"
	"github.com/serviciosysistemas/sys-scan-agent/internal/queue"
	syncapi "github.com/serviciosysistemas/sys-scan-agent/internal/sync"
)

// ── Fakes ────────────────────────────────────────────────────────────────

type fakeSync struct {
	mu              sync.Mutex
	estado          *syncapi.EstadoEscaneo
	transiciones    []string
	consentimientos []syncapi.Consentimiento
	chunksRecibidos [][]json.RawMessage
	fallarEnvios    int // cantidad de EnviarChunk que fallan antes de funcionar
	errEstado       error
}

func (f *fakeSync) ObtenerEstado(context.Context) (*syncapi.EstadoEscaneo, error) {
	return f.estado, f.errEstado
}

func (f *fakeSync) RegistrarConsentimiento(_ context.Context, c syncapi.Consentimiento) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.consentimientos = append(f.consentimientos, c)
	return nil
}

func (f *fakeSync) EnviarChunk(_ context.Context, dispositivos []json.RawMessage) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fallarEnvios > 0 {
		f.fallarEnvios--
		return errors.New("sin conexión con AuditApp: dial tcp: connection refused")
	}
	f.chunksRecibidos = append(f.chunksRecibidos, dispositivos)
	return nil
}

func (f *fakeSync) Transicion(_ context.Context, estado, _ string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.transiciones = append(f.transiciones, estado)
	return nil
}

type fakeDocker struct {
	cont      *dockerx.Contenedor
	detenidos []string
}

func (f *fakeDocker) AsegurarImagen(context.Context, func(dockerx.ProgresoPull)) error { return nil }
func (f *fakeDocker) LevantarContenedor(context.Context, string) (*dockerx.Contenedor, error) {
	return f.cont, nil
}
func (f *fakeDocker) DetenerContenedor(_ context.Context, id string) error {
	f.detenidos = append(f.detenidos, id)
	return nil
}
func (f *fakeDocker) ContenedorVivo(context.Context, string) (bool, error) {
	return true, nil
}

type fakeOA struct {
	devices  []openaudit.OADevice
	credIDs  []string
	borradas []string
	detenido bool
}

func (f *fakeOA) EsperarListo(context.Context) error { return nil }
func (f *fakeOA) CrearCredenciales(_ context.Context, lista []creds.Credencial) ([]string, error) {
	ids := make([]string, len(lista))
	for i := range lista {
		ids[i] = string(rune('1' + i))
	}
	f.credIDs = ids
	return ids, nil
}
func (f *fakeOA) BorrarCredenciales(_ context.Context, ids []string) error {
	f.borradas = append(f.borradas, ids...)
	return nil
}
func (f *fakeOA) EjecutarDiscovery(context.Context, string) (string, error) { return "disc-1", nil }
func (f *fakeOA) EstadoDiscovery(context.Context, string) (*openaudit.DiscoveryEstado, error) {
	return &openaudit.DiscoveryEstado{ID: "disc-1", Status: "complete"}, nil
}
func (f *fakeOA) Dispositivos(context.Context) ([]openaudit.OADevice, error) { return f.devices, nil }

type fakeNmap struct {
	disponible bool
	tabla      map[string]nmaphost.EntradaARP
}

func (f *fakeNmap) Verificar(context.Context) nmaphost.Disponibilidad {
	if f.disponible {
		return nmaphost.Disponibilidad{NmapInstalado: true, CapturaOK: true}
	}
	return nmaphost.Disponibilidad{NmapInstalado: true, CapturaOK: false, Detalle: "sin captura"}
}
func (f *fakeNmap) BarridoARP(context.Context, string) (map[string]nmaphost.EntradaARP, error) {
	return f.tabla, nil
}

type fakeCreds struct {
	guardadas map[string][]creds.Credencial
	purgados  []string
}

func (f *fakeCreds) Guardar(escaneoID string, lista []creds.Credencial) error {
	if f.guardadas == nil {
		f.guardadas = map[string][]creds.Credencial{}
	}
	f.guardadas[escaneoID] = lista
	return nil
}
func (f *fakeCreds) Leer(escaneoID string) ([]creds.Credencial, error) {
	return f.guardadas[escaneoID], nil
}
func (f *fakeCreds) Purgar(escaneoID string) error {
	f.purgados = append(f.purgados, escaneoID)
	delete(f.guardadas, escaneoID)
	return nil
}

// ── Harness ──────────────────────────────────────────────────────────────

type harness struct {
	orq   *Orquestador
	sync  *fakeSync
	oa    *fakeOA
	nmap  *fakeNmap
	creds *fakeCreds
	cola  *queue.Store
}

func nuevoHarness(t *testing.T, estadoInicial *syncapi.EstadoEscaneo, devices []openaudit.OADevice) *harness {
	t.Helper()
	if estadoInicial == nil {
		estadoInicial = &syncapi.EstadoEscaneo{
			Estado: "pendiente", RangoObjetivo: "192.168.10.0/24",
			Empresa: "Acme SA", Auditoria: "Auditoría 2026",
		}
	}

	cola, err := queue.Open(t.TempDir() + "/cola.db")
	if err != nil {
		t.Fatalf("queue.Open: %v", err)
	}
	t.Cleanup(func() { _ = cola.Close() })

	norm, err := normalize.New(slog.New(slog.NewJSONHandler(io.Discard, nil)))
	if err != nil {
		t.Fatalf("normalize.New: %v", err)
	}

	fs := &fakeSync{estado: estadoInicial}
	foa := &fakeOA{devices: devices}
	fn := &fakeNmap{disponible: true, tabla: map[string]nmaphost.EntradaARP{}}
	fc := &fakeCreds{}

	h := &harness{sync: fs, oa: foa, nmap: fn, creds: fc, cola: cola}

	h.orq = Nuevo(Deps{
		NuevoSync: func(context.Context, string) (SyncClient, *syncapi.EstadoEscaneo, error) {
			return fs, fs.estado, nil
		},
		Docker:       &fakeDocker{cont: &dockerx.Contenedor{ID: "cont-1", Nombre: "sys-scan-test", PuertoHost: 9999}},
		NuevoOA:      func(*dockerx.Contenedor) OpenAuditClient { return foa },
		Nmap:         fn,
		Normalizador: norm,
		Cola:         cola,
		Creds:        fc,
		Log:          slog.New(slog.NewJSONHandler(io.Discard, nil)),
		Esperar:      func(context.Context, time.Duration) error { return nil }, // sin esperas en tests
	})
	return h
}

func device(ip, oaType string) openaudit.OADevice {
	attrs := map[string]any{"ip": ip, "type": oaType}
	return openaudit.OADevice{
		ID:         "id-" + ip,
		Attributes: attrs,
		Included:   map[string][]map[string]any{},
		Raw:        map[string]any{"attributes": attrs},
	}
}

func esperarFase(t *testing.T, o *Orquestador, fases ...string) ScanProgreso {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		p := o.Estado()
		for _, f := range fases {
			if p.Fase == f {
				return p
			}
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("nunca llegó a %v; fase actual: %s (error: %s)", fases, o.Estado().Fase, o.Estado().Error)
	return ScanProgreso{}
}

// ── Tests ────────────────────────────────────────────────────────────────

func TestFlujoFelizCompleto(t *testing.T) {
	devices := []openaudit.OADevice{
		device("192.168.10.10", "computer"),
		device("192.168.10.50", "printer"),
	}
	h := nuevoHarness(t, nil, devices)
	h.nmap.tabla["192.168.10.10"] = nmaphost.EntradaARP{IP: "192.168.10.10", MAC: "AA:BB:CC:DD:EE:10"}
	h.nmap.tabla["192.168.10.90"] = nmaphost.EntradaARP{IP: "192.168.10.90", MAC: "AA:BB:CC:DD:EE:90", Vendor: "Ubiquiti"}

	ctx := context.Background()
	estado, err := h.orq.Preparar(ctx, "token-valido")
	if err != nil {
		t.Fatalf("Preparar: %v", err)
	}
	if estado.Empresa != "Acme SA" {
		t.Fatalf("contexto: %+v", estado)
	}
	if !h.orq.ConsentimientoPendiente() {
		t.Fatalf("debería pedir consentimiento")
	}

	err = h.orq.Iniciar(ctx, "esc-1",
		[]creds.Credencial{{Nombre: "wmi", Tipo: creds.TipoWindows, Usuario: "a", Password: "b"}},
		"María Pérez")
	if err != nil {
		t.Fatalf("Iniciar: %v", err)
	}

	p := esperarFase(t, h.orq, FaseCompletado)

	// Consentimiento registrado antes de en_curso (R14/R15)
	if len(h.sync.consentimientos) != 1 || h.sync.consentimientos[0].ConsentimientoPor != "María Pérez" {
		t.Fatalf("consentimiento no registrado: %+v", h.sync.consentimientos)
	}
	// Orden de transiciones: en_curso → sincronizando → completado (R15/R17)
	esp := []string{"en_curso", "sincronizando", "completado"}
	if len(h.sync.transiciones) != len(esp) {
		t.Fatalf("transiciones: %v", h.sync.transiciones)
	}
	for i, e := range esp {
		if h.sync.transiciones[i] != e {
			t.Fatalf("transición %d: %s ≠ %s", i, h.sync.transiciones[i], e)
		}
	}

	// 2 devices de OA + 1 solo-ARP (192.168.10.90) = 3 sincronizados
	if p.Encontrados != 3 || p.Sincronizados != 3 {
		t.Fatalf("encontrados=%d sincronizados=%d", p.Encontrados, p.Sincronizados)
	}

	// Purga completa (R10): credenciales OA borradas + keychain purgado
	if len(h.oa.borradas) == 0 {
		t.Fatalf("no se borraron las credenciales de Open-AudIT")
	}
	if len(h.creds.purgados) != 1 || h.creds.purgados[0] != "esc-1" {
		t.Fatalf("no se purgó el keychain: %v", h.creds.purgados)
	}

	// Fase persistida limpiada al completar
	if _, ok, _ := h.cola.FaseGuardada("esc-1"); ok {
		t.Fatalf("la fase persistida debería limpiarse al completar")
	}
}

func TestConsentimientoYaOtorgadoNoSeRepite(t *testing.T) {
	h := nuevoHarness(t, &syncapi.EstadoEscaneo{
		Estado: "pendiente", RangoObjetivo: "10.0.0.0/24",
		Empresa: "X", Auditoria: "Y", ConsentimientoOtorgado: true,
	}, nil)

	ctx := context.Background()
	if _, err := h.orq.Preparar(ctx, "tok"); err != nil {
		t.Fatalf("Preparar: %v", err)
	}
	if h.orq.ConsentimientoPendiente() {
		t.Fatalf("no debería pedir consentimiento")
	}
	if err := h.orq.Iniciar(ctx, "esc-2", nil, ""); err != nil {
		t.Fatalf("Iniciar: %v", err)
	}
	esperarFase(t, h.orq, FaseCompletado)

	if len(h.sync.consentimientos) != 0 {
		t.Fatalf("no debería re-registrar consentimiento")
	}
}

func TestModoDegradadoSinCaptura(t *testing.T) {
	h := nuevoHarness(t, nil, []openaudit.OADevice{device("10.0.0.5", "computer")})
	h.nmap.disponible = false

	ctx := context.Background()
	_, _ = h.orq.Preparar(ctx, "tok")
	if err := h.orq.Iniciar(ctx, "esc-3", nil, "Autoriza Uno"); err != nil {
		t.Fatalf("Iniciar: %v", err)
	}
	p := esperarFase(t, h.orq, FaseCompletado)

	// R7: sigue el escaneo pero con advertencia persistente
	if !p.ModoDegradado || p.Advertencia == "" {
		t.Fatalf("debería estar en modo degradado con advertencia: %+v", p)
	}
	if p.Sincronizados != 1 {
		t.Fatalf("debería sincronizar lo de OA igual: %d", p.Sincronizados)
	}
}

func TestSinConectividadNoCompletaYAlVolverDrena(t *testing.T) {
	h := nuevoHarness(t, nil, []openaudit.OADevice{device("10.0.0.7", "computer")})
	h.sync.fallarEnvios = 1 // el primer intento de chunk falla

	ctx := context.Background()
	_, _ = h.orq.Preparar(ctx, "tok")
	_ = h.orq.Iniciar(ctx, "esc-4", nil, "Autoriza Uno")

	// Con Esperar sin-opaco, el drenado reintenta: el 2do intento funciona.
	// Pero RegistrarIntento programa proximo_intento a +30s → la cola no está
	// vacía y el loop sigue sin completar.
	time.Sleep(300 * time.Millisecond)
	p := h.orq.Estado()
	if p.Fase == FaseCompletado {
		t.Fatalf("no debería completar con el primer envío fallido")
	}

	// "Vuelve internet": el técnico toca reintentar (fuerza listos)
	if err := h.orq.ReintentarCola("esc-4"); err != nil {
		t.Fatalf("ReintentarCola: %v", err)
	}
	p = esperarFase(t, h.orq, FaseCompletado)
	if p.Sincronizados != 1 {
		t.Fatalf("al volver internet debería drenar: %d", p.Sincronizados)
	}

	// Idempotencia: el server recibió 1 solo chunk con 1 dispositivo (R19)
	if len(h.sync.chunksRecibidos) != 1 || len(h.sync.chunksRecibidos[0]) != 1 {
		t.Fatalf("chunks recibidos: %v", h.sync.chunksRecibidos)
	}
}

func TestUnSoloEscaneoActivo(t *testing.T) {
	h := nuevoHarness(t, nil, nil)

	// Simular escaneo activo trabando el monitoreo
	h.orq.mu.Lock()
	h.orq.activo = true
	h.orq.mu.Unlock()

	err := h.orq.Iniciar(context.Background(), "esc-x", nil, "")
	if !errors.Is(err, ErrEscaneoActivo) {
		t.Fatalf("esperaba ErrEscaneoActivo: %v", err)
	}
}

func TestSegundoEscaneoTrasCompletar(t *testing.T) {
	// R20: tras completar, se puede iniciar el siguiente sin reiniciar
	h := nuevoHarness(t, nil, nil)
	ctx := context.Background()

	_, _ = h.orq.Preparar(ctx, "tok")
	_ = h.orq.Iniciar(ctx, "esc-a", nil, "Autoriza")
	esperarFase(t, h.orq, FaseCompletado)

	// Nuevo token/escaneo sin reiniciar la app
	_, err := h.orq.Preparar(ctx, "tok-2")
	if err != nil {
		t.Fatalf("Preparar 2: %v", err)
	}
	if err := h.orq.Iniciar(ctx, "esc-b", nil, "Autoriza"); err != nil {
		t.Fatalf("el segundo escaneo debería poder iniciar: %v", err)
	}
	esperarFase(t, h.orq, FaseCompletado)
}

func TestContenedorMuertoEnMonitoreo(t *testing.T) {
	h := nuevoHarness(t, nil, nil)
	// Docker que reporta contenedor muerto
	h.orq.deps.Docker = &fakeDockerMuerto{}

	ctx := context.Background()
	_, _ = h.orq.Preparar(ctx, "tok")
	_ = h.orq.Iniciar(ctx, "esc-5", nil, "Autoriza")

	p := esperarFase(t, h.orq, FaseFallido)
	if p.Error == "" {
		t.Fatalf("debería mostrar error accionable (R32)")
	}
	// Transicionó a fallido con purga
	if len(h.creds.purgados) == 0 {
		t.Fatalf("la purga debe correr también en fallo (R10)")
	}
}

type fakeDockerMuerto struct{}

func (f *fakeDockerMuerto) AsegurarImagen(context.Context, func(dockerx.ProgresoPull)) error {
	return nil
}
func (f *fakeDockerMuerto) LevantarContenedor(context.Context, string) (*dockerx.Contenedor, error) {
	return &dockerx.Contenedor{ID: "cont-muerto", Nombre: "sys-scan-x", PuertoHost: 9998}, nil
}
func (f *fakeDockerMuerto) DetenerContenedor(context.Context, string) error { return nil }
func (f *fakeDockerMuerto) ContenedorVivo(context.Context, string) (bool, error) {
	return false, nil // muerto
}

func TestReanudacionMuestraFasePersistida(t *testing.T) {
	h := nuevoHarness(t, nil, nil)

	// Simular cierre inesperado: queda fase persistida
	if err := h.cola.GuardarFase("esc-viejo", FaseSincronizando); err != nil {
		t.Fatalf("GuardarFase: %v", err)
	}

	fase, ok, err := h.orq.FasePersistida("esc-viejo")
	if err != nil || !ok || fase != FaseSincronizando {
		t.Fatalf("FasePersistida: %q %v %v", fase, ok, err)
	}
}
