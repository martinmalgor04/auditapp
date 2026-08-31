// Package creds guarda las credenciales del cliente ÚNICAMENTE en el almacén
// seguro del OS (Keychain en macOS, Credential Manager/DPAPI en Windows),
// namespaced por escaneo (R9). Fail-closed: sin almacén no hay escaneo (R12).
package creds

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/99designs/keyring"
)

// ErrAlmacenNoDisponible indica que el OS no tiene almacén seguro accesible
// (R12): el agente rechaza el inicio del escaneo, sin fallback a archivos.
var ErrAlmacenNoDisponible = errors.New("almacén seguro del sistema no disponible")

const servicioKeyring = "sys-scan-agent"

// TipoCredencial mapea a los tipos de credencial de Open-AudIT.
type TipoCredencial string

const (
	TipoWindows TipoCredencial = "windows" // WMI
	TipoSSH     TipoCredencial = "ssh"
	TipoSNMP    TipoCredencial = "snmp"    // v1/v2c (community)
	TipoSNMPv3  TipoCredencial = "snmp_v3" // USM
)

// Credencial de acceso a dispositivos del cliente. Vive en memoria y en el
// keyring del OS; NUNCA se envía a AuditApp ni se escribe en logs (R11).
type Credencial struct {
	Nombre string         `json:"nombre"` // etiqueta interna, p. ej. "wmi-dominio"
	Tipo   TipoCredencial `json:"tipo"`

	// windows / ssh / snmp_v3
	Usuario  string `json:"usuario,omitempty"`
	Password string `json:"password,omitempty"`

	// snmp v1/v2c
	Community string `json:"community,omitempty"`

	// snmp_v3
	AuthProtocol   string `json:"authProtocol,omitempty"` // MD5 | SHA
	AuthPassphrase string `json:"authPassphrase,omitempty"`
	PrivProtocol   string `json:"privProtocol,omitempty"` // DES | AES
	PrivPassphrase string `json:"privPassphrase,omitempty"`
}

// KeyringAPI es la porción de keyring.Keyring que usa el store (permite un
// fake in-memory en tests sin depender de un keyring real del OS).
type KeyringAPI interface {
	Get(key string) (keyring.Item, error)
	Set(item keyring.Item) error
	Remove(key string) error
	Keys() ([]string, error)
}

// Store guarda y purga credenciales namespaced por escaneo.
type Store struct {
	kr KeyringAPI
}

// Open abre el almacén seguro del OS. Si no está disponible devuelve
// ErrAlmacenNoDisponible (fail-closed, R12).
func Open() (*Store, error) {
	kr, err := keyring.Open(keyring.Config{ServiceName: servicioKeyring})
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrAlmacenNoDisponible, err)
	}
	return NewStore(kr), nil
}

// NewStore construye el store sobre un keyring ya abierto (o fake en tests).
func NewStore(kr KeyringAPI) *Store {
	return &Store{kr: kr}
}

func clave(escaneoID, nombre string) string {
	return servicioKeyring + "/" + escaneoID + "/" + nombre
}

func prefijo(escaneoID string) string {
	return servicioKeyring + "/" + escaneoID + "/"
}

// Guardar persiste las credenciales del escaneo (una entrada por credencial).
func (s *Store) Guardar(escaneoID string, creds []Credencial) error {
	for _, c := range creds {
		if c.Nombre == "" {
			return fmt.Errorf("credencial sin nombre")
		}
		data, err := json.Marshal(c)
		if err != nil {
			return fmt.Errorf("serializar credencial: %w", err)
		}
		if err := s.kr.Set(keyring.Item{
			Key:         clave(escaneoID, c.Nombre),
			Data:        data,
			Label:       "Credencial de escaneo SyS (efímera)",
			Description: "Se elimina automáticamente al cerrar el escaneo",
		}); err != nil {
			return fmt.Errorf("guardar en almacén seguro: %w", err)
		}
	}
	return nil
}

// Leer devuelve las credenciales del escaneo, ordenadas por nombre.
func (s *Store) Leer(escaneoID string) ([]Credencial, error) {
	keys, err := s.kr.Keys()
	if err != nil {
		return nil, fmt.Errorf("listar almacén seguro: %w", err)
	}
	pre := prefijo(escaneoID)
	var out []Credencial
	for _, k := range keys {
		if !strings.HasPrefix(k, pre) {
			continue
		}
		item, err := s.kr.Get(k)
		if err != nil {
			return nil, fmt.Errorf("leer credencial: %w", err)
		}
		var c Credencial
		if err := json.Unmarshal(item.Data, &c); err != nil {
			return nil, fmt.Errorf("deserializar credencial: %w", err)
		}
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Nombre < out[j].Nombre })
	return out, nil
}

// Purgar elimina TODAS las credenciales del escaneo (R10). Es idempotente.
func (s *Store) Purgar(escaneoID string) error {
	keys, err := s.kr.Keys()
	if err != nil {
		return fmt.Errorf("listar almacén seguro: %w", err)
	}
	pre := prefijo(escaneoID)
	for _, k := range keys {
		if !strings.HasPrefix(k, pre) {
			continue
		}
		if err := s.kr.Remove(k); err != nil {
			return fmt.Errorf("purgar credencial: %w", err)
		}
	}
	return nil
}

// PurgarHuerfanas elimina credenciales de escaneos que ya no están activos
// (limpieza de arranque, complemento de R10/R24). `activos` contiene los
// escaneoId con escaneo en curso; el resto se purga.
func (s *Store) PurgarHuerfanas(activos map[string]bool) error {
	keys, err := s.kr.Keys()
	if err != nil {
		return fmt.Errorf("listar almacén seguro: %w", err)
	}
	pre := servicioKeyring + "/"
	for _, k := range keys {
		if !strings.HasPrefix(k, pre) {
			continue
		}
		resto := strings.TrimPrefix(k, pre)
		escaneoID, _, _ := strings.Cut(resto, "/")
		if escaneoID == "" || activos[escaneoID] {
			continue
		}
		if err := s.kr.Remove(k); err != nil {
			return fmt.Errorf("purgar credencial huérfana: %w", err)
		}
	}
	return nil
}
