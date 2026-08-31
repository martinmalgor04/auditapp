// Package scan es el orquestador del escaneo: máquina de fases con estado
// persistente (reanudación tras cierre, R18/R32), un solo escaneo activo a
// la vez (R20), y purga completa al cerrar (R10).
//
// Fases (design):
//
//	validar_token → consentimiento → en_curso → barrido_arp_host →
//	levantar_contenedor → configurar_discovery → monitorear →
//	recolectar_y_normalizar → sincronizando → drenar_cola → completado
//	                └────────── en cualquier fase: error → fallido ──────────┘
package scan

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/serviciosysistemas/sys-scan-agent/internal/creds"
	"github.com/serviciosysistemas/sys-scan-agent/internal/dockerx"
	"github.com/serviciosysistemas/sys-scan-agent/internal/nmaphost"
	"github.com/serviciosysistemas/sys-scan-agent/internal/normalize"
	"github.com/serviciosysistemas/sys-scan-agent/internal/openaudit"
	"github.com/serviciosysistemas/sys-scan-agent/internal/queue"
	syncapi "github.com/serviciosysistemas/sys-scan-agent/internal/sync"
)

// Fases del escaneo (persistidas en scan_state para reanudación).
const (
	FaseValidandoToken = "validar_token"
	FaseConsentimiento = "consentimiento"
	FaseEnCurso        = "en_curso"
	FaseBarridoARP     = "barrido_arp_host"
	FaseContenedor     = "levantar_contenedor"
	FaseDiscovery      = "configurar_discovery"
	FaseMonitoreo      = "monitorear"
	FaseRecolecta      = "recolectar_y_normalizar"
	FaseSincronizando  = "sincronizando"
	FaseDrenando       = "drenar_cola"
	FaseCompletado     = "completado"
	FaseFallido        = "fallido"
	FaseCancelado      = "cancelado"
)

// TamanoChunk: el agente envía de a 50 (el server acepta hasta 100, R27).
const TamanoChunk = 50

// ScanProgreso es la vista en vivo para la UI (R16).
type ScanProgreso struct {
	EscaneoID      string
	Fase           string
	Encontrados    int
	Sincronizados  int
	ModoDegradado  bool
	Advertencia    string // persistente en modo degradado (R7)
	Error          string // accionable, en criollo, sin stack traces (R31)
	ColaPausada    bool   // hay chunks pausados esperando decisión (R18)
	PullPorcentaje int    // descarga de imagen (R21)
	Empresa        string
	Auditoria      string
	Etiqueta       string
	Rango          string
}

// ── Puertos de las dependencias (interfaces chicas, fakes en tests) ──────

type SyncClient interface {
	ObtenerEstado(ctx context.Context) (*syncapi.EstadoEscaneo, error)
	RegistrarConsentimiento(ctx context.Context, c syncapi.Consentimiento) error
	EnviarChunk(ctx context.Context, dispositivos []json.RawMessage) error
	Transicion(ctx context.Context, estado, detalle string) error
}

type DockerClient interface {
	AsegurarImagen(ctx context.Context, progreso func(dockerx.ProgresoPull)) error
	LevantarContenedor(ctx context.Context, escaneoID string) (*dockerx.Contenedor, error)
	DetenerContenedor(ctx context.Context, id string) error
	ContenedorVivo(ctx context.Context, id string) (bool, error)
}

type OpenAuditClient interface {
	EsperarListo(ctx context.Context) error
	CrearCredenciales(ctx context.Context, lista []creds.Credencial) ([]string, error)
	BorrarCredenciales(ctx context.Context, ids []string) error
	EjecutarDiscovery(ctx context.Context, rango string) (string, error)
	EstadoDiscovery(ctx context.Context, id string) (*openaudit.DiscoveryEstado, error)
	Dispositivos(ctx context.Context) ([]openaudit.OADevice, error)
}

// OpenAuditFactory construye el cliente de OA para el contenedor levantado.
type OpenAuditFactory func(cont *dockerx.Contenedor) OpenAuditClient

type NmapRunner interface {
	Verificar(ctx context.Context) nmaphost.Disponibilidad
	BarridoARP(ctx context.Context, rango string) (map[string]nmaphost.EntradaARP, error)
}

type Normalizador interface {
	DesdeOpenAudit(d openaudit.OADevice, arpHost map[string]nmaphost.EntradaARP, vistoAt time.Time) (*normalize.DispositivoInput, error)
	SoloARP(e nmaphost.EntradaARP, vistoAt time.Time) (*normalize.DispositivoInput, error)
	Descartar(d openaudit.OADevice, err error)
}

type QueueStore interface {
	Encolar(escaneoID, endpoint string, payload []byte) error
	Pendientes(escaneoID string) ([]queue.Chunk, error)
	Pausados(escaneoID string) ([]queue.Chunk, error)
	MarcarEnviado(id int64) error
	RegistrarIntento(id int64) error
	ReanudarPausados(escaneoID string) error
	ForzarListos(escaneoID string) error
	ColaVacia(escaneoID string) (bool, error)
	GuardarFase(escaneoID, fase string) error
	FaseGuardada(escaneoID string) (string, bool, error)
	LimpiarFase(escaneoID string) error
}

type CredStore interface {
	Guardar(escaneoID string, lista []creds.Credencial) error
	Leer(escaneoID string) ([]creds.Credencial, error)
	Purgar(escaneoID string) error
}

// ErrEscaneoActivo: un solo escaneo activo a la vez (R20).
var ErrEscaneoActivo = errors.New("ya hay un escaneo activo; terminalo o cancelalo antes de iniciar otro")

// errCanceladoPorTecnico: el técnico canceló (ctx cancelado en una espera).
var errCanceladoPorTecnico = errors.New("escaneo cancelado por el técnico")

// Deps agrupa las dependencias del orquestador.
type Deps struct {
	NuevoSync    func(ctx context.Context, token string) (SyncClient, *syncapi.EstadoEscaneo, error)
	Docker       DockerClient
	NuevoOA      OpenAuditFactory
	Nmap         NmapRunner
	Normalizador Normalizador
	Cola         QueueStore
	Creds        CredStore
	Log          *slog.Logger

	// Esperar es inyectable para tests (el loop de monitoreo y drenado).
	Esperar func(ctx context.Context, d time.Duration) error
}

// Orquestador ejecuta UN escaneo activo a la vez.
type Orquestador struct {
	deps Deps

	mu       sync.Mutex
	progreso ScanProgreso
	activo   bool
	cancel   context.CancelFunc

	// estado del escaneo en curso (para cierre/purga)
	syncCli   SyncClient
	cont      *dockerx.Contenedor
	oaCli     OpenAuditClient
	oaCredIDs []string
	estadoOA  *syncapi.EstadoEscaneo
}

func Nuevo(deps Deps) *Orquestador {
	if deps.Log == nil {
		deps.Log = slog.Default()
	}
	if deps.Esperar == nil {
		deps.Esperar = func(ctx context.Context, d time.Duration) error {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(d):
				return nil
			}
		}
	}
	return &Orquestador{deps: deps}
}

// Estado devuelve el progreso actual (thread-safe, R16).
func (o *Orquestador) Estado() ScanProgreso {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.progreso
}

func (o *Orquestador) setFase(fase string) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.progreso.Fase = fase
	// Las fases terminales no se persisten: la reanudación (R18/R32) solo
	// aplica a escaneos a mitad de camino.
	if fase == FaseCompletado || fase == FaseFallido || fase == FaseCancelado {
		return
	}
	if id := o.progreso.EscaneoID; id != "" {
		// Última fase completa persistida: reanudación tras cierre (R18/R32).
		if err := o.deps.Cola.GuardarFase(id, fase); err != nil {
			o.deps.Log.Warn("no se pudo persistir la fase", "error", err)
		}
	}
}

func (o *Orquestador) setError(msg string) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.progreso.Error = msg
}

// Preparar valida el token contra AuditApp y devuelve los datos del escaneo
// para confirmación del técnico (R13). No inicia nada ni toca la red.
func (o *Orquestador) Preparar(ctx context.Context, token string) (*syncapi.EstadoEscaneo, error) {
	syncCli, estado, err := o.deps.NuevoSync(ctx, token)
	if err != nil {
		if errors.Is(err, syncapi.ErrNoAutorizado) {
			return nil, errors.New("ese token no es válido o ya no está vigente. Pedí uno nuevo en AuditApp")
		}
		if errors.Is(err, syncapi.ErrVersionIncompatible) {
			return nil, errors.New("esta versión del agente es vieja. Descargá la nueva desde el aviso de AuditApp")
		}
		return nil, fmt.Errorf("no se pudo validar el token: %w", err)
	}
	if estado.Estado != "pendiente" && estado.Estado != "en_curso" {
		return nil, fmt.Errorf("este escaneo ya está %q; creá uno nuevo en AuditApp", estado.Estado)
	}
	o.mu.Lock()
	o.syncCli = syncCli
	o.estadoOA = estado
	o.mu.Unlock()
	return estado, nil
}

// ConsentimientoPendiente reporta si hay que capturar quién autoriza (R14).
func (o *Orquestador) ConsentimientoPendiente() bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.estadoOA != nil && !o.estadoOA.ConsentimientoOtorgado
}

// Iniciar arranca el escaneo en segundo plano (R14/R15). credenciales son
// las del cliente cargadas en la UI; consentimientoPor es quien autoriza
// (obligatorio si el consentimiento no estaba registrado).
func (o *Orquestador) Iniciar(ctx context.Context, escaneoID string, credenciales []creds.Credencial, consentimientoPor string) error {
	o.mu.Lock()
	if o.activo {
		o.mu.Unlock()
		return ErrEscaneoActivo
	}
	if o.syncCli == nil || o.estadoOA == nil {
		o.mu.Unlock()
		return errors.New("primero validá el token del escaneo")
	}
	o.activo = true
	o.progreso = ScanProgreso{
		EscaneoID: escaneoID,
		Fase:      FaseValidandoToken,
		Empresa:   o.estadoOA.Empresa,
		Auditoria: o.estadoOA.Auditoria,
		Rango:     o.estadoOA.RangoObjetivo,
	}
	if o.estadoOA.Etiqueta != nil {
		o.progreso.Etiqueta = *o.estadoOA.Etiqueta
	}
	o.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	o.mu.Lock()
	o.cancel = cancel
	o.mu.Unlock()

	go o.ejecutar(ctx, escaneoID, credenciales, consentimientoPor)
	return nil
}

// Cancelar detiene el escaneo en curso (el técnico lo decide, R10: purga
// igual).
func (o *Orquestador) Cancelar(ctx context.Context) error {
	o.mu.Lock()
	cancel := o.cancel
	o.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	return nil
}

// ejecutar es la máquina de fases propiamente dicha.
func (o *Orquestador) ejecutar(ctx context.Context, escaneoID string, credenciales []creds.Credencial, consentimientoPor string) {
	defer func() {
		o.mu.Lock()
		o.activo = false
		o.mu.Unlock()
	}()

	o.mu.Lock()
	rango := o.progreso.Rango
	o.mu.Unlock()

	fallo := func(fase string, err error) {
		// Cancelación del técnico → cancelado (no fallido).
		estadoFinal := FaseFallido
		if errors.Is(err, errCanceladoPorTecnico) {
			estadoFinal = FaseCancelado
		}
		o.deps.Log.Error("escaneo terminó con error", "fase", fase, "estadoFinal", estadoFinal, "error", err)
		o.setError(mensajeCriollo(fase, err))
		o.setFase(estadoFinal)
		// Transición con detalle (#60 R18), best effort.
		ctx2, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = o.syncCli.Transicion(ctx2, estadoFinal, mensajeCriollo(fase, err))
		_ = o.purgar(context.Background(), escaneoID)
	}

	// ── Fase: credenciales al keyring (R9) ───────────────────────────────
	o.setFase(FaseConsentimiento)
	if err := o.deps.Creds.Guardar(escaneoID, credenciales); err != nil {
		fallo(FaseConsentimiento, fmt.Errorf("no se pudieron guardar las credenciales en el almacén seguro: %w", err))
		return
	}

	// ── Fase: consentimiento (R14) ───────────────────────────────────────
	if o.ConsentimientoPendiente() {
		if consentimientoPor == "" {
			fallo(FaseConsentimiento, errors.New("falta quién autoriza el escaneo"))
			return
		}
		if err := o.syncCli.RegistrarConsentimiento(ctx, syncapi.Consentimiento{
			ConsentimientoPor: consentimientoPor,
			ConsentimientoAt:  time.Now(),
		}); err != nil {
			fallo(FaseConsentimiento, err)
			return
		}
	}

	// ── Fase: en_curso ANTES de cualquier tráfico de discovery (R15) ─────
	if err := o.syncCli.Transicion(ctx, "en_curso", ""); err != nil {
		fallo(FaseEnCurso, err)
		return
	}
	o.setFase(FaseEnCurso)

	// ── Fase: barrido ARP en el host (R5); degradado si no hay (R7) ──────
	o.setFase(FaseBarridoARP)
	arpHost := map[string]nmaphost.EntradaARP{}
	disp := o.deps.Nmap.Verificar(ctx)
	if disp.Disponible() {
		tabla, err := o.deps.Nmap.BarridoARP(ctx, rango)
		if err != nil {
			o.deps.Log.Warn("barrido ARP falló, sigo degradado", "error", err)
			o.activarModoDegradado()
		} else {
			arpHost = tabla
			o.mu.Lock()
			o.progreso.Encontrados = len(tabla)
			o.mu.Unlock()
		}
	} else {
		o.deps.Log.Warn("modo degradado", "detalle", disp.Detalle)
		o.activarModoDegradado()
	}

	// ── Fase: imagen + contenedor (R21/R22) ──────────────────────────────
	o.setFase(FaseContenedor)
	if err := o.deps.Docker.AsegurarImagen(ctx, func(p dockerx.ProgresoPull) {
		o.mu.Lock()
		o.progreso.PullPorcentaje = p.Porcentaje
		o.mu.Unlock()
	}); err != nil {
		fallo(FaseContenedor, err)
		return
	}
	cont, err := o.deps.Docker.LevantarContenedor(ctx, escaneoID)
	if err != nil {
		fallo(FaseContenedor, err)
		return
	}
	o.mu.Lock()
	o.cont = cont
	o.mu.Unlock()

	oaCli := o.deps.NuevoOA(cont)
	o.mu.Lock()
	o.oaCli = oaCli
	o.mu.Unlock()

	if err := oaCli.EsperarListo(ctx); err != nil {
		fallo(FaseContenedor, err)
		return
	}

	// ── Fase: credenciales + discovery (R23) ─────────────────────────────
	o.setFase(FaseDiscovery)
	ids, err := oaCli.CrearCredenciales(ctx, credenciales)
	if err != nil {
		fallo(FaseDiscovery, err)
		return
	}
	o.mu.Lock()
	o.oaCredIDs = ids
	o.mu.Unlock()

	discoveryID, err := oaCli.EjecutarDiscovery(ctx, rango)
	if err != nil {
		fallo(FaseDiscovery, err)
		return
	}

	// ── Fase: monitoreo (R16; R32 si el contenedor muere) ────────────────
	o.setFase(FaseMonitoreo)
	if err := o.monitorear(ctx, discoveryID, cont.ID); err != nil {
		fallo(FaseMonitoreo, err)
		return
	}

	// ── Fase: recolectar, normalizar y encolar (R25/R26/R27) ─────────────
	o.setFase(FaseRecolecta)
	devices, err := oaCli.Dispositivos(ctx)
	if err != nil {
		fallo(FaseRecolecta, err)
		return
	}
	if err := o.recolectarYEncolar(escaneoID, devices, arpHost); err != nil {
		fallo(FaseRecolecta, err)
		return
	}

	// ── Fase: sincronizando → drenar → completado (R17) ──────────────────
	if err := o.syncCli.Transicion(ctx, "sincronizando", ""); err != nil {
		fallo(FaseSincronizando, err)
		return
	}
	o.setFase(FaseSincronizando)

	if err := o.drenarHastaVaciar(ctx, escaneoID); err != nil {
		fallo(FaseDrenando, err)
		return
	}
	o.setFase(FaseDrenando)

	if err := o.syncCli.Transicion(ctx, "completado", ""); err != nil {
		fallo(FaseCompletado, err)
		return
	}

	// ── Cierre con purga completa (R10) ──────────────────────────────────
	if err := o.purgar(context.Background(), escaneoID); err != nil {
		o.deps.Log.Error("purga incompleta", "error", err)
		o.setError("El escaneo terminó pero no se pudo limpiar todo. Reiniciá el agente para completar la limpieza.")
	}
	_ = o.deps.Cola.LimpiarFase(escaneoID)
	o.setFase(FaseCompletado)
}

func (o *Orquestador) activarModoDegradado() {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.progreso.ModoDegradado = true
	o.progreso.Advertencia = "Escaneo sin barrido ARP: los equipos sin credenciales pueden quedar sin MAC."
}

// monitorear hace polling del discovery hasta que termina; vigila que el
// contenedor siga vivo (R32).
func (o *Orquestador) monitorear(ctx context.Context, discoveryID, contID string) error {
	for {
		vivo, err := o.deps.Docker.ContenedorVivo(ctx, contID)
		if err != nil || !vivo {
			return errors.New("Docker Desktop se detuvo o el contenedor de escaneo murió. Reintentá o marcá el escaneo como fallido")
		}

		est, err := o.oaCli.EstadoDiscovery(ctx, discoveryID)
		if err != nil {
			return err
		}
		switch est.Status {
		case "complete", "completed", "finished":
			return nil
		case "failed", "error":
			return fmt.Errorf("el discovery falló en Open-AudIT (%s)", est.Status)
		}

		if err := o.deps.Esperar(ctx, 5*time.Second); err != nil {
			return errCanceladoPorTecnico
		}
	}
}

// recolectarYEncolar normaliza los devices de OA, agrega los hosts solo-ARP
// y encola chunks de 50 validados (R25/R27).
func (o *Orquestador) recolectarYEncolar(escaneoID string, devices []openaudit.OADevice, arpHost map[string]nmaphost.EntradaARP) error {
	vistoAt := time.Now()
	var validos []json.RawMessage
	vistosPorOA := map[string]bool{}

	for _, d := range devices {
		disp, err := o.deps.Normalizador.DesdeOpenAudit(d, arpHost, vistoAt)
		if err != nil {
			o.deps.Normalizador.Descartar(d, err) // R25: descartar y seguir
			continue
		}
		vistosPorOA[disp.IP] = true
		data, err := json.Marshal(disp)
		if err != nil {
			o.deps.Normalizador.Descartar(d, err)
			continue
		}
		validos = append(validos, data)
	}

	// Hosts que respondieron ARP pero OA no reportó (R8: 100 % con MAC).
	for ip, entrada := range arpHost {
		if vistosPorOA[ip] {
			continue
		}
		disp, err := o.deps.Normalizador.SoloARP(entrada, vistoAt)
		if err != nil {
			o.deps.Log.Warn("host ARP descartado", "ip", ip, "error", err)
			continue
		}
		data, _ := json.Marshal(disp)
		validos = append(validos, data)
	}

	o.mu.Lock()
	o.progreso.Encontrados = len(validos)
	o.mu.Unlock()

	for i := 0; i < len(validos); i += TamanoChunk {
		fin := min(i+TamanoChunk, len(validos))
		payload, err := json.Marshal(map[string]any{"dispositivos": validos[i:fin]})
		if err != nil {
			return fmt.Errorf("armar chunk: %w", err)
		}
		if err := o.deps.Cola.Encolar(escaneoID, "dispositivos", payload); err != nil {
			return err
		}
	}
	return nil
}

// drenarHastaVaciar envía la cola con reintentos hasta que quede vacía
// (R17/R18). Nunca transiciona a completado con cola no vacía.
func (o *Orquestador) drenarHastaVaciar(ctx context.Context, escaneoID string) error {
	for {
		if err := o.drenarUnaVez(ctx, escaneoID); err != nil {
			return err // error fatal (p. ej. versión incompatible, R28)
		}

		vacia, err := o.deps.Cola.ColaVacia(escaneoID)
		if err != nil {
			return err
		}
		if vacia {
			return nil
		}

		// ¿Hay pausados esperando decisión del técnico? (R18)
		pausados, err := o.deps.Cola.Pausados(escaneoID)
		if err != nil {
			return err
		}
		o.mu.Lock()
		o.progreso.ColaPausada = len(pausados) > 0
		o.mu.Unlock()

		if err := o.deps.Esperar(ctx, 5*time.Second); err != nil {
			return errCanceladoPorTecnico
		}
	}
}

// drenarUnaVez envía los chunks listos (FIFO). Los que fallan quedan con
// backoff (RegistrarIntento); 429 respeta la ventana del server.
func (o *Orquestador) drenarUnaVez(ctx context.Context, escaneoID string) error {
	pendientes, err := o.deps.Cola.Pendientes(escaneoID)
	if err != nil {
		return err
	}
	for _, chunk := range pendientes {
		if err := o.enviarChunk(ctx, chunk); err != nil {
			if errors.Is(err, syncapi.ErrVersionIncompatible) {
				return errors.New("hay una versión nueva del agente. Actualizala y volvé a intentar")
			}
			var rl *syncapi.RateLimitError
			if errors.As(err, &rl) {
				// Respetar la ventana del server antes de seguir (#60 R23/R24)
				espera := rl.RetryAfter
				if espera <= 0 {
					espera = 30 * time.Second
				}
				if err := o.deps.Esperar(ctx, espera); err != nil {
					return errCanceladoPorTecnico
				}
			}
			_ = o.deps.Cola.RegistrarIntento(chunk.ID)
			continue
		}
		if err := o.deps.Cola.MarcarEnviado(chunk.ID); err != nil {
			return err
		}
		if chunk.Endpoint == "dispositivos" {
			var body struct {
				Dispositivos []json.RawMessage `json:"dispositivos"`
			}
			if json.Unmarshal(chunk.Payload, &body) == nil {
				o.mu.Lock()
				o.progreso.Sincronizados += len(body.Dispositivos)
				o.mu.Unlock()
			}
		}
	}
	return nil
}

func (o *Orquestador) enviarChunk(ctx context.Context, chunk queue.Chunk) error {
	switch chunk.Endpoint {
	case "dispositivos":
		var body struct {
			Dispositivos []json.RawMessage `json:"dispositivos"`
		}
		if err := json.Unmarshal(chunk.Payload, &body); err != nil {
			return fmt.Errorf("chunk corrupto: %w", err)
		}
		return o.syncCli.EnviarChunk(ctx, body.Dispositivos)
	case "estado":
		var body struct {
			Estado       string `json:"estado"`
			ErrorDetalle string `json:"errorDetalle"`
		}
		if err := json.Unmarshal(chunk.Payload, &body); err != nil {
			return fmt.Errorf("chunk corrupto: %w", err)
		}
		return o.syncCli.Transicion(ctx, body.Estado, body.ErrorDetalle)
	case "consentimiento":
		var body syncapi.Consentimiento
		if err := json.Unmarshal(chunk.Payload, &body); err != nil {
			return fmt.Errorf("chunk corrupto: %w", err)
		}
		return o.syncCli.RegistrarConsentimiento(ctx, body)
	default:
		return fmt.Errorf("endpoint desconocido: %s", chunk.Endpoint)
	}
}

// purgar elimina credenciales de OA, destruye el contenedor y purga el
// keychain del escaneo (R10). Best effort con log de cada fallo.
func (o *Orquestador) purgar(ctx context.Context, escaneoID string) error {
	var fallos []error

	o.mu.Lock()
	oaCli, credIDs, cont := o.oaCli, o.oaCredIDs, o.cont
	o.mu.Unlock()

	if oaCli != nil && len(credIDs) > 0 {
		if err := oaCli.BorrarCredenciales(ctx, credIDs); err != nil {
			fallos = append(fallos, err)
		}
	}
	if cont != nil {
		if err := o.deps.Docker.DetenerContenedor(ctx, cont.ID); err != nil {
			fallos = append(fallos, err)
		}
	}
	if err := o.deps.Creds.Purgar(escaneoID); err != nil {
		fallos = append(fallos, err)
	}
	return errors.Join(fallos...)
}

// ReintentarCola reactiva chunks pausados y fuerza reintento inmediato
// (decisión del técnico ante «Sin internet hace rato», R18).
func (o *Orquestador) ReintentarCola(escaneoID string) error {
	if err := o.deps.Cola.ReanudarPausados(escaneoID); err != nil {
		return err
	}
	return o.deps.Cola.ForzarListos(escaneoID)
}

// FasePersistida expone la fase guardada para la reanudación al arrancar.
func (o *Orquestador) FasePersistida(escaneoID string) (string, bool, error) {
	return o.deps.Cola.FaseGuardada(escaneoID)
}

// mensajeCriollo traduce errores técnicos a mensajes accionables (R31).
func mensajeCriollo(fase string, err error) string {
	switch {
	case errors.Is(err, errCanceladoPorTecnico):
		return "Cancelaste el escaneo. Se limpiaron las credenciales y el contenedor."
	case errors.Is(err, syncapi.ErrVersionIncompatible):
	case errors.Is(err, syncapi.ErrVersionIncompatible):
		return "Hay una versión nueva del agente. Actualizala y volvé a intentar."
	case errors.Is(err, syncapi.ErrNoAutorizado):
		return "El token dejó de ser válido. Pedí uno nuevo en AuditApp."
	case errors.Is(err, dockerx.ErrDockerNoDisponible):
		return "Docker Desktop no está corriendo. Abrilo y reintentá."
	case errors.Is(err, openaudit.ErrNoListo):
		return "El motor de escaneo no arrancó a tiempo. Reintentá; si sigue, reiniciá Docker Desktop."
	case errors.Is(err, creds.ErrAlmacenNoDisponible):
		return "Esta notebook no tiene el almacén seguro disponible. Sin eso no se puede escanear."
	}
	m := map[string]string{
		FaseConsentimiento: "No se pudo registrar el consentimiento. Verificá los datos y reintentá.",
		FaseEnCurso:        "AuditApp no dejó iniciar el escaneo. Verificá el estado del escaneo en la web.",
		FaseContenedor:     "No se pudo preparar el motor de escaneo. Verificá que Docker Desktop esté corriendo.",
		FaseDiscovery:      "No se pudo configurar el discovery. Reintentá el escaneo.",
		FaseMonitoreo:      "El discovery se interrumpió. Reintentá o marcá el escaneo como fallido.",
		FaseRecolecta:      "No se pudieron leer los dispositivos encontrados. Reintentá el escaneo.",
		FaseDrenando:       "No se pudo terminar de sincronizar. Verificá internet y reintentá.",
	}
	if msg, ok := m[fase]; ok {
		return msg
	}
	return "El escaneo falló. Reintentá; si sigue, exportá los logs y avisale a SyS."
}
