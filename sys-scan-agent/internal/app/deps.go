package app

import (
	"context"

	"github.com/serviciosysistemas/sys-scan-agent/internal/creds"
	"github.com/serviciosysistemas/sys-scan-agent/internal/dockerx"
	"github.com/serviciosysistemas/sys-scan-agent/internal/nmaphost"
)

// dockerLazy reintenta la conexión con Docker en cada operación si no había
// al arrancar (el técnico pudo instalarlo con la asistencia de R3).
type dockerLazy struct {
	app *App
}

func (d *dockerLazy) cliente(ctx context.Context) (*dockerx.Client, error) {
	d.app.mu.Lock()
	cli := d.app.docker
	d.app.mu.Unlock()
	if cli != nil {
		return cli, nil
	}
	nuevo, err := dockerx.Nuevo(ctx)
	if err != nil {
		return nil, err
	}
	d.app.mu.Lock()
	d.app.docker = nuevo
	d.app.dockerErr = nil
	d.app.mu.Unlock()
	return nuevo, nil
}

func (d *dockerLazy) AsegurarImagen(ctx context.Context, progreso func(dockerx.ProgresoPull)) error {
	cli, err := d.cliente(ctx)
	if err != nil {
		return err
	}
	return cli.AsegurarImagen(ctx, progreso)
}

func (d *dockerLazy) LevantarContenedor(ctx context.Context, escaneoID string) (*dockerx.Contenedor, error) {
	cli, err := d.cliente(ctx)
	if err != nil {
		return nil, err
	}
	return cli.LevantarContenedor(ctx, escaneoID)
}

func (d *dockerLazy) DetenerContenedor(ctx context.Context, id string) error {
	cli, err := d.cliente(ctx)
	if err != nil {
		return err
	}
	return cli.DetenerContenedor(ctx, id)
}

func (d *dockerLazy) ContenedorVivo(ctx context.Context, id string) (bool, error) {
	cli, err := d.cliente(ctx)
	if err != nil {
		return false, err
	}
	return cli.ContenedorVivo(ctx, id)
}

// credStoreFallible aplica fail-closed (R12): sin almacén seguro, toda
// operación de credenciales falla con mensaje accionable.
type credStoreFallible struct {
	app *App
}

func (c *credStoreFallible) store() (*creds.Store, error) {
	if c.app.credStore == nil {
		return nil, creds.ErrAlmacenNoDisponible
	}
	return c.app.credStore, nil
}

func (c *credStoreFallible) Guardar(escaneoID string, lista []creds.Credencial) error {
	s, err := c.store()
	if err != nil {
		return err
	}
	return s.Guardar(escaneoID, lista)
}

func (c *credStoreFallible) Leer(escaneoID string) ([]creds.Credencial, error) {
	s, err := c.store()
	if err != nil {
		return nil, err
	}
	return s.Leer(escaneoID)
}

func (c *credStoreFallible) Purgar(escaneoID string) error {
	s, err := c.store()
	if err != nil {
		return err
	}
	return s.Purgar(escaneoID)
}

// nmapRunner adapta las funciones de nmaphost a la interfaz del orquestador.
type nmapRunner struct{}

func (nmapRunner) Verificar(ctx context.Context) nmaphost.Disponibilidad {
	return nmaphost.Verificar(ctx)
}

func (nmapRunner) BarridoARP(ctx context.Context, rango string) (map[string]nmaphost.EntradaARP, error) {
	return nmaphost.BarridoARP(ctx, rango)
}
