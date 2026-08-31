package creds

import (
	"errors"
	"strings"
	"testing"

	"github.com/99designs/keyring"
)

// fakeKeyring implementa KeyringAPI en memoria (el keyring real del OS no
// existe en CI headless).
type fakeKeyring struct {
	items   map[string]keyring.Item
	failAll bool
}

func newFakeKeyring() *fakeKeyring {
	return &fakeKeyring{items: map[string]keyring.Item{}}
}

func (f *fakeKeyring) Get(key string) (keyring.Item, error) {
	if f.failAll {
		return keyring.Item{}, errors.New("keyring caído")
	}
	item, ok := f.items[key]
	if !ok {
		return keyring.Item{}, keyring.ErrKeyNotFound
	}
	return item, nil
}

func (f *fakeKeyring) Set(item keyring.Item) error {
	if f.failAll {
		return errors.New("keyring caído")
	}
	f.items[item.Key] = item
	return nil
}

func (f *fakeKeyring) Remove(key string) error {
	if f.failAll {
		return errors.New("keyring caído")
	}
	delete(f.items, key)
	return nil
}

func (f *fakeKeyring) Keys() ([]string, error) {
	if f.failAll {
		return nil, errors.New("keyring caído")
	}
	keys := make([]string, 0, len(f.items))
	for k := range f.items {
		keys = append(keys, k)
	}
	return keys, nil
}

func credencialesDePrueba() []Credencial {
	return []Credencial{
		{Nombre: "wmi-dominio", Tipo: TipoWindows, Usuario: "CLIENTE\\admin", Password: "secreto-wmi"},
		{Nombre: "ssh-linux", Tipo: TipoSSH, Usuario: "root", Password: "secreto-ssh"},
		{Nombre: "snmp-red", Tipo: TipoSNMP, Community: "public"},
	}
}

func TestGuardarYLeerPorEscaneo(t *testing.T) {
	store := NewStore(newFakeKeyring())

	if err := store.Guardar("esc-1", credencialesDePrueba()); err != nil {
		t.Fatalf("Guardar: %v", err)
	}

	creds, err := store.Leer("esc-1")
	if err != nil {
		t.Fatalf("Leer: %v", err)
	}
	if len(creds) != 3 {
		t.Fatalf("esperaba 3 credenciales, hay %d", len(creds))
	}
	// Ordenadas por nombre
	if creds[0].Nombre != "snmp-red" || creds[2].Nombre != "wmi-dominio" {
		t.Fatalf("orden inesperado: %v", []string{creds[0].Nombre, creds[1].Nombre, creds[2].Nombre})
	}
	if creds[2].Password != "secreto-wmi" {
		t.Fatalf("password no sobrevivió el round-trip")
	}
}

func TestAislamientoEntreEscaneos(t *testing.T) {
	store := NewStore(newFakeKeyring())

	_ = store.Guardar("esc-1", credencialesDePrueba())
	_ = store.Guardar("esc-2", []Credencial{{Nombre: "snmp-otro", Tipo: TipoSNMP, Community: "private"}})

	creds2, err := store.Leer("esc-2")
	if err != nil {
		t.Fatalf("Leer esc-2: %v", err)
	}
	if len(creds2) != 1 || creds2[0].Community != "private" {
		t.Fatalf("esc-2 debería tener solo su credencial: %+v", creds2)
	}
}

func TestPurgarEliminaTodoElEscaneo(t *testing.T) {
	kr := newFakeKeyring()
	store := NewStore(kr)

	_ = store.Guardar("esc-1", credencialesDePrueba())
	_ = store.Guardar("esc-2", []Credencial{{Nombre: "snmp-otro", Tipo: TipoSNMP, Community: "private"}})

	if err := store.Purgar("esc-1"); err != nil {
		t.Fatalf("Purgar: %v", err)
	}

	creds, err := store.Leer("esc-1")
	if err != nil {
		t.Fatalf("Leer tras purga: %v", err)
	}
	if len(creds) != 0 {
		t.Fatalf("quedaron %d credenciales tras purgar", len(creds))
	}

	// No queda rastro físico en el almacén
	for k := range kr.items {
		if strings.Contains(k, "esc-1") {
			t.Fatalf("quedó la clave %q tras purgar", k)
		}
	}

	// El otro escaneo sigue intacto
	creds2, _ := store.Leer("esc-2")
	if len(creds2) != 1 {
		t.Fatalf("la purga de esc-1 afectó a esc-2")
	}

	// Idempotente
	if err := store.Purgar("esc-1"); err != nil {
		t.Fatalf("Purgar idempotente: %v", err)
	}
}

func TestPurgarHuerfanasRespetaActivos(t *testing.T) {
	store := NewStore(newFakeKeyring())

	_ = store.Guardar("esc-activo", credencialesDePrueba())
	_ = store.Guardar("esc-viejo", credencialesDePrueba())

	err := store.PurgarHuerfanas(map[string]bool{"esc-activo": true})
	if err != nil {
		t.Fatalf("PurgarHuerfanas: %v", err)
	}

	if creds, _ := store.Leer("esc-activo"); len(creds) != 3 {
		t.Fatalf("el escaneo activo perdió credenciales")
	}
	if creds, _ := store.Leer("esc-viejo"); len(creds) != 0 {
		t.Fatalf("el escaneo huérfano conservó credenciales")
	}
}

func TestFailClosedSinAlmacen(t *testing.T) {
	store := NewStore(newFakeKeyring())
	store.kr = &fakeKeyring{failAll: true}

	if err := store.Guardar("esc-1", credencialesDePrueba()); err == nil {
		t.Fatalf("Guardar debería fallar sin almacén")
	}
	if _, err := store.Leer("esc-1"); err == nil {
		t.Fatalf("Leer debería fallar sin almacén")
	}
}

func TestGuardarRechazaCredencialSinNombre(t *testing.T) {
	store := NewStore(newFakeKeyring())
	err := store.Guardar("esc-1", []Credencial{{Tipo: TipoSNMP, Community: "public"}})
	if err == nil {
		t.Fatalf("debería rechazar credencial sin nombre")
	}
}
