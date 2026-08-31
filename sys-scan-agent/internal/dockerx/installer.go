package dockerx

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// URL del instalador oficial de Docker Desktop por plataforma (R3). Las
// versiones las publica Docker; el agente descarga el canal estable actual.
const (
	urlDockerDesktopWindows = "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe"
	urlDockerDesktopMacARM  = "https://desktop.docker.com/mac/main/arm64/Docker.dmg"
)

// descargar baja url a un archivo temporal, verificando SHA-256 cuando se
// pasa uno no vacío. Reporta progreso (0–100) si se pasa callback.
func descargar(ctx context.Context, url, sha256Esperado string, progreso func(int)) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := (&http.Client{Timeout: 0}).Do(req) // descargas grandes: sin timeout total
	if err != nil {
		return "", fmt.Errorf("descarga fallida: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("descarga fallida: HTTP %d", resp.StatusCode)
	}

	tmp, err := os.CreateTemp("", "sys-scan-descarga-*")
	if err != nil {
		return "", err
	}

	hash := sha256.New()
	total := resp.ContentLength
	var bajados int64
	buf := make([]byte, 256*1024)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := tmp.Write(buf[:n]); werr != nil {
				_ = tmp.Close()
				return "", werr
			}
			hash.Write(buf[:n])
			bajados += int64(n)
			if progreso != nil && total > 0 {
				progreso(int(bajados * 100 / total))
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			_ = tmp.Close()
			return "", fmt.Errorf("descarga interrumpida: %w", err)
		}
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}

	if sha256Esperado != "" {
		got := hex.EncodeToString(hash.Sum(nil))
		if got != sha256Esperado {
			_ = os.Remove(tmp.Name())
			return "", fmt.Errorf("la descarga no coincide con el SHA-256 esperado")
		}
	}
	return tmp.Name(), nil
}

// esperarDaemon hace polling hasta que el daemon responde o vence el timeout
// (tras instalar/iniciar Docker Desktop, R3).
func esperarDaemon(ctx context.Context, api DockerAPI, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	for {
		if _, err := api.Ping(ctx); err == nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("%w: Docker Desktop no respondió a tiempo tras la instalación", ErrDockerNoDisponible)
		case <-time.After(3 * time.Second):
		}
	}
}

// limpiarTemporal borra el instalador descargado.
func limpiarTemporal(path string) {
	if path != "" && filepath.IsAbs(path) {
		_ = os.Remove(path)
	}
}
