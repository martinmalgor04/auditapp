package logx

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// rotateWriter escribe a un archivo y rota al superar maxBytes, conservando
// hasta maxBackups históricos (agente.log.1 es el más reciente).
type rotateWriter struct {
	mu         sync.Mutex
	dir        string
	name       string
	maxBytes   int64
	maxBackups int

	file *os.File
	size int64
}

func newRotateWriter(dir, name string, maxBytes int64, maxBackups int) (*rotateWriter, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	w := &rotateWriter{dir: dir, name: name, maxBytes: maxBytes, maxBackups: maxBackups}
	if err := w.abrir(); err != nil {
		return nil, err
	}
	return w, nil
}

func (w *rotateWriter) ruta() string {
	return filepath.Join(w.dir, w.name)
}

func (w *rotateWriter) abrir() error {
	f, err := os.OpenFile(w.ruta(), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return err
	}
	w.file = f
	w.size = info.Size()
	return nil
}

func (w *rotateWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.size+int64(len(p)) > w.maxBytes {
		if err := w.rotar(); err != nil {
			return 0, err
		}
	}
	n, err := w.file.Write(p)
	w.size += int64(n)
	return n, err
}

func (w *rotateWriter) rotar() error {
	if err := w.file.Close(); err != nil {
		return err
	}
	// agente.log.(N-1) → agente.log.N, …, agente.log → agente.log.1
	ultimo := filepath.Join(w.dir, fmt.Sprintf("%s.%d", w.name, w.maxBackups))
	_ = os.Remove(ultimo)
	for i := w.maxBackups - 1; i >= 1; i-- {
		viejo := filepath.Join(w.dir, fmt.Sprintf("%s.%d", w.name, i))
		nuevo := filepath.Join(w.dir, fmt.Sprintf("%s.%d", w.name, i+1))
		_ = os.Rename(viejo, nuevo) // puede no existir: OK
	}
	if err := os.Rename(w.ruta(), filepath.Join(w.dir, w.name+".1")); err != nil {
		return err
	}
	return w.abrir()
}

func (w *rotateWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.file.Close()
}
