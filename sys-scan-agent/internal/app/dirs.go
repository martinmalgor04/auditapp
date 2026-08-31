//go:build !windows && !darwin

package app

import (
	"os"
	"path/filepath"
	"runtime"
)

func esWindows() bool {
	return runtime.GOOS == "windows"
}

// directorioDatosOS genérico (Linux dev/CI; no es plataforma de producto).
func directorioDatosOS() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".local", "share", "sys-scan-agent"), nil
}
