// Package update chequea si hay una versión más nueva del agente leyendo el
// version.json estático de AuditApp (R29). Sin auto-update en v1: solo aviso
// con link de descarga. Sin conectividad, no avisa ni rompe (el chequeo es
// best-effort al inicio).
package update

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// VersionPublicada es el version.json que AuditApp sirve en
// /agente/version.json (static/agente/version.json, T2).
type VersionPublicada struct {
	Version       string `json:"version"`
	URLWindows    string `json:"urlWindows"`
	URLMac        string `json:"urlMac"`
	Sha256Windows string `json:"sha256Windows"`
	Sha256Mac     string `json:"sha256Mac"`
}

// Aviso de nueva versión para el banner de la UI.
type Aviso struct {
	VersionNueva string
	URLWindows   string
	URLMac       string
}

// Chequear consulta el version.json de AuditApp. Devuelve nil (sin error) si
// no hay conectividad, el JSON es inválido o no hay versión más nueva: el
// chequeo nunca interrumpe el arranque del agente.
func Chequear(ctx context.Context, baseURL, versionActual string) *Aviso {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		strings.TrimRight(baseURL, "/")+"/agente/version.json", nil)
	if err != nil {
		return nil
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil // sin conectividad: no hay aviso, no es error
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil
	}

	var pub VersionPublicada
	if err := json.NewDecoder(resp.Body).Decode(&pub); err != nil {
		return nil
	}
	if !EsMasNueva(versionActual, pub.Version) {
		return nil
	}
	return &Aviso{
		VersionNueva: pub.Version,
		URLWindows:   pub.URLWindows,
		URLMac:       pub.URLMac,
	}
}

// EsMasNueva compara semver MAJOR.MINOR.PATCH; a igualdad de núcleo, una
// versión con pre-release es MENOR que la release final (regla semver §11).
// Una versión actual no parseable (p. ej. "dev") se considera siempre vieja
// si la publicada es parseable.
func EsMasNueva(actual, publicada string) bool {
	a, preA, errA := parsearSemver(actual)
	p, preP, errP := parsearSemver(publicada)
	if errP != nil {
		return false
	}
	if errA != nil {
		return true // build dev: siempre avisar que existe una release
	}
	for i := 0; i < 3; i++ {
		if p[i] != a[i] {
			return p[i] > a[i]
		}
	}
	// Núcleos iguales: la release final supera a la pre-release.
	return preA && !preP
}

// parsearSemver devuelve [major, minor, patch] y si tiene pre-release.
func parsearSemver(v string) ([3]int, bool, error) {
	var out [3]int
	limpio := strings.TrimPrefix(strings.TrimSpace(v), "v")
	limpio = strings.SplitN(limpio, "+", 2)[0]
	conPre := strings.SplitN(limpio, "-", 2)
	nucleo := conPre[0]
	preRelease := len(conPre) == 2 && conPre[1] != ""
	partes := strings.Split(nucleo, ".")
	if len(partes) != 3 {
		return out, false, fmt.Errorf("no es semver: %q", v)
	}
	for i, p := range partes {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 {
			return out, false, fmt.Errorf("no es semver: %q", v)
		}
		out[i] = n
	}
	return out, preRelease, nil
}
