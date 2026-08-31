//go:build darwin

package app

import (
	"os"
	"path/filepath"
)

func esWindows() bool { return false }

// ~/Library/Application Support/sys-scan-agent (design §Cola offline).
func directorioDatosOS() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Library", "Application Support", "sys-scan-agent"), nil
}
