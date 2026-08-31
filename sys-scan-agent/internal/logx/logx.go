// Package logx es el logger local del agente. Redacta secretos antes de
// escribir (R11): ninguna credencial, community, passphrase o token puede
// aparecer en los logs, ni como campo ni dentro de un mensaje libre.
//
// Los logs rotan (5 archivos × 5 MB) y se exportan ya redactados para
// soporte («Exportar logs» en la UI).
package logx

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"regexp"
	"strings"
	"sync"
)

const redactado = "***"

// clavesSensibles matchea nombres de campo cuyo valor se redacta siempre.
var clavesSensibles = regexp.MustCompile(`(?i)password|community|secret|token|passphrase|credential`)

// Handler es un slog.Handler que redacta secretos y delega en otro handler.
type Handler struct {
	inner slog.Handler

	mu       sync.RWMutex
	secretos []string // valores literales a redactar en cualquier string
}

// NewHandler envuelve un handler con redacción.
func NewHandler(inner slog.Handler) *Handler {
	return &Handler{inner: inner}
}

// RegistrarSecreto agrega un valor literal (p. ej. una contraseña cargada en
// la UI) para redactarlo en cualquier mensaje o campo, aunque no venga bajo
// una clave sensible. Los valores de menos de 4 caracteres se ignoran para
// no destruir los logs con falsos positivos.
func (h *Handler) RegistrarSecreto(valor string) {
	if len(valor) < 4 {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.secretos = append(h.secretos, valor)
}

// OlvidarSecretos limpia la lista de valores registrados (al cerrar el
// escaneo, junto con la purga del keychain — R10).
func (h *Handler) OlvidarSecretos() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.secretos = nil
}

func (h *Handler) redactarTexto(s string) string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, sec := range h.secretos {
		if sec != "" {
			s = strings.ReplaceAll(s, sec, redactado)
		}
	}
	return s
}

func (h *Handler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.inner.Enabled(ctx, level)
}

func (h *Handler) Handle(ctx context.Context, r slog.Record) error {
	nr := slog.NewRecord(r.Time, r.Level, h.redactarTexto(r.Message), r.PC)
	r.Attrs(func(a slog.Attr) bool {
		nr.AddAttrs(h.redactarAttr(a))
		return true
	})
	return h.inner.Handle(ctx, nr)
}

func (h *Handler) redactarAttr(a slog.Attr) slog.Attr {
	if clavesSensibles.MatchString(a.Key) {
		return slog.String(a.Key, redactado)
	}
	if a.Value.Kind() == slog.KindString {
		return slog.String(a.Key, h.redactarTexto(a.Value.String()))
	}
	if a.Value.Kind() == slog.KindGroup {
		attrs := a.Value.Group()
		out := make([]slog.Attr, len(attrs))
		for i, ga := range attrs {
			out[i] = h.redactarAttr(ga)
		}
		return slog.Attr{Key: a.Key, Value: slog.GroupValue(out...)}
	}
	return a
}

func (h *Handler) WithAttrs(attrs []slog.Attr) slog.Handler {
	redactados := make([]slog.Attr, len(attrs))
	for i, a := range attrs {
		redactados[i] = h.redactarAttr(a)
	}
	clon := &Handler{inner: h.inner.WithAttrs(redactados)}
	clon.secretos = h.secretosRef()
	return clon
}

func (h *Handler) WithGroup(name string) slog.Handler {
	clon := &Handler{inner: h.inner.WithGroup(name)}
	clon.secretos = h.secretosRef()
	return clon
}

func (h *Handler) secretosRef() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.secretos
}

// Config parámetros del logger local.
type Config struct {
	Dir        string // directorio de logs (dir de datos del OS)
	MaxBytes   int64  // tamaño máximo por archivo (default 5 MB)
	MaxBackups int    // archivos históricos (default 5)
	Level      slog.Level
}

// New crea un logger con redacción que escribe a <Dir>/agente.log con
// rotación, y devuelve también el handler para registrar secretos.
func New(cfg Config) (*slog.Logger, *Handler, io.Closer, error) {
	if cfg.MaxBytes <= 0 {
		cfg.MaxBytes = 5 * 1024 * 1024
	}
	if cfg.MaxBackups <= 0 {
		cfg.MaxBackups = 5
	}
	fw, err := newRotateWriter(cfg.Dir, "agente.log", cfg.MaxBytes, cfg.MaxBackups)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("abrir log local: %w", err)
	}
	inner := slog.NewJSONHandler(fw, &slog.HandlerOptions{Level: cfg.Level})
	h := NewHandler(inner)
	return slog.New(h), h, fw, nil
}
