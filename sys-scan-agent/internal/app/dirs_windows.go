//go:build windows

package app

import (
	"os"
	"path/filepath"
)

func esWindows() bool { return true }

// %APPDATA%\sys-scan-agent (design §Cola offline).
func directorioDatosOS() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "sys-scan-agent"), nil
}
