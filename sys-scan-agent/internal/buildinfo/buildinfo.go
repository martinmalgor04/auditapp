// Package buildinfo expone la versión del agente, inyectada por ldflags en
// los builds de release (T15): -X .../internal/buildinfo.Version=1.0.0
package buildinfo

// Version semver del agente. "dev" en builds locales sin ldflags.
var Version = "dev"
