// Package queue es el almacén local SQLite del agente: cola de chunks
// pendientes de sincronización (R18/R19) y estado de fase del escaneo para
// reanudación tras cierre inesperado (R32).
//
// Driver modernc.org/sqlite (puro Go): cross-compile sin CGO.
package queue

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// MaxIntentos antes de pausar un chunk y pedir decisión al técnico (R18:
// «Sin internet hace rato. ¿Seguir esperando o pausar?» — nunca se descarta
// solo).
const MaxIntentos = 20

// Backoff base y techo (design: 30s × 2^intentos, techo 15 min).
const (
	backoffBase  = 30 * time.Second
	backoffTecho = 15 * time.Minute
)

// Chunk pendiente de envío a AuditApp.
type Chunk struct {
	ID             int64
	EscaneoID      string
	Endpoint       string // dispositivos | estado | consentimiento
	Payload        []byte // JSON validado contra el schema (R25)
	Intentos       int
	ProximoIntento time.Time
	CreatedAt      time.Time
}

// Store es la cola persistente del agente.
type Store struct {
	db *sql.DB
}

// Open abre (o crea) la base SQLite del agente en `path`.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite",
		fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)", path))
	if err != nil {
		return nil, fmt.Errorf("abrir cola local: %w", err)
	}
	// Una sola conexión: SQLite en WAL serializa escritores; con pool >1 hay
	// SQLITE_BUSY intermitente bajo drenado + encolado concurrente.
	db.SetMaxOpenConns(1)

	if err := migrar(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func migrar(db *sql.DB) error {
	_, err := db.Exec(`
CREATE TABLE IF NOT EXISTS chunk_queue (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  escaneo_id      TEXT NOT NULL,
  endpoint        TEXT NOT NULL,
  payload         TEXT NOT NULL,
  intentos        INTEGER NOT NULL DEFAULT 0,
  proximo_intento INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunk_queue_drenado
  ON chunk_queue (escaneo_id, proximo_intento, id);

CREATE TABLE IF NOT EXISTS scan_state (
  escaneo_id  TEXT PRIMARY KEY,
  fase        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);`)
	if err != nil {
		return fmt.Errorf("migrar cola local: %w", err)
	}
	return nil
}

// Close cierra la base.
func (s *Store) Close() error {
	return s.db.Close()
}

// Backoff calcula la espera tras `intentos` fallidos: 30s × 2^n, techo 15 min.
func Backoff(intentos int) time.Duration {
	if intentos < 0 {
		intentos = 0
	}
	d := backoffBase
	for i := 0; i < intentos; i++ {
		d *= 2
		if d >= backoffTecho {
			return backoffTecho
		}
	}
	return d
}

// Encolar agrega un chunk a la cola del escaneo, listo para el primer intento.
func (s *Store) Encolar(escaneoID, endpoint string, payload []byte) error {
	if escaneoID == "" || endpoint == "" {
		return errors.New("encolar: escaneoID y endpoint son obligatorios")
	}
	ahora := time.Now()
	_, err := s.db.Exec(
		`INSERT INTO chunk_queue (escaneo_id, endpoint, payload, intentos, proximo_intento, created_at)
		 VALUES (?, ?, ?, 0, ?, ?)`,
		escaneoID, endpoint, string(payload), ahora.Unix(), ahora.Unix())
	if err != nil {
		return fmt.Errorf("encolar chunk: %w", err)
	}
	return nil
}

// Pendientes devuelve los chunks del escaneo listos para reintentar (FIFO),
// excluyendo los pausados por exceder MaxIntentos.
func (s *Store) Pendientes(escaneoID string) ([]Chunk, error) {
	return s.consultar(escaneoID,
		`AND intentos < ? AND proximo_intento <= ?`, MaxIntentos, time.Now().Unix())
}

// Pausados devuelve los chunks que superaron MaxIntentos y esperan decisión
// del técnico (R18).
func (s *Store) Pausados(escaneoID string) ([]Chunk, error) {
	return s.consultar(escaneoID, `AND intentos >= ?`, MaxIntentos)
}

func (s *Store) consultar(escaneoID, condicion string, args ...interface{}) ([]Chunk, error) {
	query := `SELECT id, escaneo_id, endpoint, payload, intentos, proximo_intento, created_at
	          FROM chunk_queue WHERE escaneo_id = ? ` + condicion + ` ORDER BY id`
	rows, err := s.db.Query(query, append([]interface{}{escaneoID}, args...)...)
	if err != nil {
		return nil, fmt.Errorf("consultar cola: %w", err)
	}
	defer rows.Close()

	var out []Chunk
	for rows.Next() {
		var c Chunk
		var payload string
		var proximo, creado int64
		if err := rows.Scan(&c.ID, &c.EscaneoID, &c.Endpoint, &payload, &c.Intentos, &proximo, &creado); err != nil {
			return nil, fmt.Errorf("leer chunk: %w", err)
		}
		c.Payload = []byte(payload)
		c.ProximoIntento = time.Unix(proximo, 0)
		c.CreatedAt = time.Unix(creado, 0)
		out = append(out, c)
	}
	return out, rows.Err()
}

// MarcarEnviado elimina el chunk de la cola (el server confirma recepción; el
// upsert de #59 R13 hace idempotente cualquier reenvío anterior).
func (s *Store) MarcarEnviado(id int64) error {
	_, err := s.db.Exec(`DELETE FROM chunk_queue WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("marcar enviado: %w", err)
	}
	return nil
}

// RegistrarIntento anota un intento fallido y programa el próximo con backoff.
func (s *Store) RegistrarIntento(id int64) error {
	var intentos int
	err := s.db.QueryRow(`SELECT intentos FROM chunk_queue WHERE id = ?`, id).Scan(&intentos)
	if err != nil {
		return fmt.Errorf("registrar intento (leer): %w", err)
	}
	intentos++
	proximo := time.Now().Add(Backoff(intentos))
	_, err = s.db.Exec(
		`UPDATE chunk_queue SET intentos = ?, proximo_intento = ? WHERE id = ?`,
		intentos, proximo.Unix(), id)
	if err != nil {
		return fmt.Errorf("registrar intento: %w", err)
	}
	return nil
}

// ReanudarPausados vuelve a activar los chunks pausados (decisión del técnico
// de seguir esperando, R18).
func (s *Store) ReanudarPausados(escaneoID string) error {
	_, err := s.db.Exec(
		`UPDATE chunk_queue SET intentos = 0, proximo_intento = ?
		 WHERE escaneo_id = ? AND intentos >= ?`,
		time.Now().Unix(), escaneoID, MaxIntentos)
	if err != nil {
		return fmt.Errorf("reanudar pausados: %w", err)
	}
	return nil
}

// ForzarListos marca todos los chunks no pausados como listos para reintento
// inmediato (botón «Reintentar ahora» de la UI, sin esperar el backoff).
func (s *Store) ForzarListos(escaneoID string) error {
	_, err := s.db.Exec(
		`UPDATE chunk_queue SET proximo_intento = ? WHERE escaneo_id = ? AND intentos < ?`,
		time.Now().Unix(), escaneoID, MaxIntentos)
	if err != nil {
		return fmt.Errorf("forzar listos: %w", err)
	}
	return nil
}

// ColaVacia reporta si no queda nada por enviar ni pausado (condición para
// transicionar a completado, R17).
func (s *Store) ColaVacia(escaneoID string) (bool, error) {
	var n int
	err := s.db.QueryRow(
		`SELECT COUNT(*) FROM chunk_queue WHERE escaneo_id = ?`, escaneoID).Scan(&n)
	if err != nil {
		return false, fmt.Errorf("cola vacía: %w", err)
	}
	return n == 0, nil
}

// ── Estado de fase del escaneo (reanudación, R18/R32) ────────────────────

// GuardarFase persiste la última fase completa del escaneo.
func (s *Store) GuardarFase(escaneoID, fase string) error {
	_, err := s.db.Exec(
		`INSERT INTO scan_state (escaneo_id, fase, updated_at) VALUES (?, ?, ?)
		 ON CONFLICT(escaneo_id) DO UPDATE SET fase = excluded.fase, updated_at = excluded.updated_at`,
		escaneoID, fase, time.Now().Unix())
	if err != nil {
		return fmt.Errorf("guardar fase: %w", err)
	}
	return nil
}

// FaseGuardada devuelve la última fase persistida del escaneo, si existe.
func (s *Store) FaseGuardada(escaneoID string) (string, bool, error) {
	var fase string
	err := s.db.QueryRow(`SELECT fase FROM scan_state WHERE escaneo_id = ?`, escaneoID).Scan(&fase)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("leer fase: %w", err)
	}
	return fase, true, nil
}

// LimpiarFase borra el estado persistido del escaneo (al cerrar completo).
func (s *Store) LimpiarFase(escaneoID string) error {
	_, err := s.db.Exec(`DELETE FROM scan_state WHERE escaneo_id = ?`, escaneoID)
	if err != nil {
		return fmt.Errorf("limpiar fase: %w", err)
	}
	return nil
}

// EscaneosConEstado lista los escaneoId con fase persistida (limpieza de
// arranque: ofrecer reanudar o marcar fallido).
func (s *Store) EscaneosConEstado() ([]string, error) {
	rows, err := s.db.Query(`SELECT escaneo_id FROM scan_state ORDER BY updated_at`)
	if err != nil {
		return nil, fmt.Errorf("listar estados: %w", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
