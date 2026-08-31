// Package dockerx orquesta el contenedor efímero de Open-AudIT: pull pineado
// por digest con progreso (R21), run --rm con API solo en 127.0.0.1 (R22),
// detección de Docker Desktop ausente/caído (R3/R32) y limpieza de huérfanos
// sys-scan-* al arranque (R24).
package dockerx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
	ocispec "github.com/opencontainers/image-spec/specs-go/v1"
)

// ErrDockerNoDisponible: el daemon no responde (no instalado, no iniciado o
// caído). La UI guía la instalación asistida (R3) o el reintento (R32).
var ErrDockerNoDisponible = errors.New("Docker Desktop no está disponible")

// ErrDigestMismatch: la imagen bajada no coincide con el digest pineado (R21).
var ErrDigestMismatch = errors.New("la imagen descargada no coincide con el digest pineado")

// PrefijoNombre de los contenedores del agente (limpieza de huérfanos R24).
const PrefijoNombre = "sys-scan-"

// DockerAPI es la porción del Docker SDK que usa el agente (fake en tests).
type DockerAPI interface {
	Ping(ctx context.Context) (types.Ping, error)
	ImagePull(ctx context.Context, ref string, options image.PullOptions) (io.ReadCloser, error)
	ImageInspect(ctx context.Context, ref string, opts ...client.ImageInspectOption) (image.InspectResponse, error)
	ContainerCreate(ctx context.Context, config *container.Config, hostConfig *container.HostConfig, networkingConfig *network.NetworkingConfig, platform *ocispec.Platform, containerName string) (container.CreateResponse, error)
	ContainerStart(ctx context.Context, containerID string, options container.StartOptions) error
	ContainerStop(ctx context.Context, containerID string, options container.StopOptions) error
	ContainerList(ctx context.Context, options container.ListOptions) ([]container.Summary, error)
	ContainerInspect(ctx context.Context, containerID string) (container.InspectResponse, error)
	ContainerRemove(ctx context.Context, containerID string, options container.RemoveOptions) error
}

// Client envuelve el Docker SDK con la lógica del agente.
type Client struct {
	api DockerAPI
	// Imagen sobreescribe la referencia pineada (tests de integración con
	// imagen local). Vacío → Referencia() (digest pineado, R21).
	Imagen string
}

func (c *Client) referencia() string {
	if c.Imagen != "" {
		return c.Imagen
	}
	return Referencia()
}

// Nuevo conecta con el daemon local y verifica que responde (R3).
func Nuevo(ctx context.Context) (*Client, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrDockerNoDisponible, err)
	}
	return NuevoConAPI(ctx, cli)
}

// NuevoConAPI construye el cliente sobre una API ya creada (tests).
func NuevoConAPI(ctx context.Context, api DockerAPI) (*Client, error) {
	c := &Client{api: api}
	if err := c.Ping(ctx); err != nil {
		return nil, err
	}
	return c, nil
}

// Ping verifica que el daemon responde, clasificando el error para la UI.
func (c *Client) Ping(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if _, err := c.api.Ping(ctx); err != nil {
		return fmt.Errorf("%w: %w", ErrDockerNoDisponible, err)
	}
	return nil
}

// ProgresoPull resume el avance de la descarga de la imagen (R21).
type ProgresoPull struct {
	CapaID      string
	Estado      string
	Descargados int64
	Total       int64
	Porcentaje  int // 0–100 agregado sobre todas las capas
}

// AsegurarImagen baja la imagen pineada (una sola vez, ~1–2 GB) reportando
// progreso, y verifica el digest local antes de usarla (R21).
func (c *Client) AsegurarImagen(ctx context.Context, progreso func(ProgresoPull)) error {
	ref := c.referencia()

	// Si ya está local y el digest coincide, no hay nada que hacer.
	if insp, err := c.api.ImageInspect(ctx, ref); err == nil {
		if err := verificarDigest(insp); err == nil {
			return nil
		}
	}

	rc, err := c.api.ImagePull(ctx, ref, image.PullOptions{})
	if err != nil {
		return fmt.Errorf("no se pudo descargar la imagen de escaneo: %w", err)
	}
	defer rc.Close()

	if err := consumirProgresoPull(rc, progreso); err != nil {
		return err
	}

	insp, err := c.api.ImageInspect(ctx, ref)
	if err != nil {
		return fmt.Errorf("verificar imagen descargada: %w", err)
	}
	return verificarDigest(insp)
}

func verificarDigest(insp image.InspectResponse) error {
	pineado, ok := DigestPineado()
	if !ok {
		return nil // sin digest pineado (dev): el tag alcanza
	}
	for _, rd := range insp.RepoDigests {
		if strings.HasSuffix(rd, "@"+pineado) {
			return nil
		}
	}
	return fmt.Errorf("%w (esperado %s)", ErrDigestMismatch, pineado)
}

// lineaPull es una línea del stream JSON de `docker pull`.
type lineaPull struct {
	ID             string `json:"id"`
	Status         string `json:"status"`
	ProgressDetail struct {
		Current int64 `json:"current"`
		Total   int64 `json:"total"`
	} `json:"progressDetail"`
	ErrorDetail *struct {
		Message string `json:"message"`
	} `json:"errorDetail"`
}

// consumirProgresoPull lee el stream JSON del pull y agrega por capa.
func consumirProgresoPull(rc io.Reader, progreso func(ProgresoPull)) error {
	capas := map[string]lineaPull{}
	dec := json.NewDecoder(rc)
	for {
		var l lineaPull
		if err := dec.Decode(&l); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return fmt.Errorf("leer progreso de descarga: %w", err)
		}
		if l.ErrorDetail != nil {
			return fmt.Errorf("descarga de imagen: %s", l.ErrorDetail.Message)
		}
		if l.ID != "" {
			capas[l.ID] = l
		}
		if progreso != nil {
			progreso(agregarProgreso(capas, l))
		}
	}
	return nil
}

func agregarProgreso(capas map[string]lineaPull, ultima lineaPull) ProgresoPull {
	var desc, total int64
	for _, c := range capas {
		desc += c.ProgressDetail.Current
		total += c.ProgressDetail.Total
	}
	p := ProgresoPull{CapaID: ultima.ID, Estado: ultima.Status, Descargados: desc, Total: total}
	if total > 0 {
		p.Porcentaje = int(desc * 100 / total)
	}
	return p
}

// Contenedor levantado para un escaneo (R22).
type Contenedor struct {
	ID         string
	Nombre     string
	PuertoHost int // API de Open-AudIT en 127.0.0.1:<puerto>
}

// BaseURL de la API de Open-AudIT de este contenedor.
func (c Contenedor) BaseURL() string {
	return fmt.Sprintf("http://127.0.0.1:%d/open-audit/index.php", c.PuertoHost)
}

// LevantarContenedor crea el contenedor efímero del escaneo: --rm, API solo
// en 127.0.0.1 de la notebook (R22), red bridge default (NAT: alcanza para
// el tráfico saliente de discovery; el ARP corre en el host, R5).
func (c *Client) LevantarContenedor(ctx context.Context, escaneoID string) (*Contenedor, error) {
	puerto, err := puertoLibre()
	if err != nil {
		return nil, fmt.Errorf("reservar puerto local: %w", err)
	}

	nombre := PrefijoNombre + escaneoID
	if len(escaneoID) > 8 {
		nombre = PrefijoNombre + escaneoID[:8]
	}

	resp, err := c.api.ContainerCreate(ctx,
		&container.Config{
			Image:  c.referencia(),
			Labels: map[string]string{"sys-scan-agent": "1", "escaneo": escaneoID},
			ExposedPorts: nat.PortSet{
				"80/tcp": struct{}{},
			},
		},
		&container.HostConfig{
			AutoRemove: true, // --rm: al parar, el contenedor y su DB interna desaparecen (R10)
			PortBindings: nat.PortMap{
				"80/tcp": []nat.PortBinding{
					{HostIP: "127.0.0.1", HostPort: fmt.Sprintf("%d", puerto)},
				},
			},
		},
		&network.NetworkingConfig{},
		nil,
		nombre)
	if err != nil {
		return nil, fmt.Errorf("crear contenedor de escaneo: %w", err)
	}

	if err := c.api.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return nil, fmt.Errorf("arrancar contenedor de escaneo: %w", err)
	}

	return &Contenedor{ID: resp.ID, Nombre: nombre, PuertoHost: puerto}, nil
}

// DetenerContenedor para el contenedor (con AutoRemove se destruye, R10).
func (c *Client) DetenerContenedor(ctx context.Context, id string) error {
	timeout := 10
	if err := c.api.ContainerStop(ctx, id, container.StopOptions{Timeout: &timeout}); err != nil {
		return fmt.Errorf("detener contenedor: %w", err)
	}
	return nil
}

// ContenedorVivo reporta si el contenedor del escaneo sigue corriendo (R32).
func (c *Client) ContenedorVivo(ctx context.Context, id string) (bool, error) {
	insp, err := c.api.ContainerInspect(ctx, id)
	if err != nil {
		if client.IsErrNotFound(err) {
			return false, nil
		}
		return false, fmt.Errorf("%w: %w", ErrDockerNoDisponible, err)
	}
	return insp.State != nil && insp.State.Running, nil
}

// LimpiarHuerfanos elimina contenedores sys-scan-* de ejecuciones anteriores
// (cierre inesperado del agente, R24). Devuelve cuántos se eliminaron.
func (c *Client) LimpiarHuerfanos(ctx context.Context) (int, error) {
	lista, err := c.api.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return 0, fmt.Errorf("%w: %w", ErrDockerNoDisponible, err)
	}

	eliminados := 0
	for _, cont := range lista {
		if !esContenedorDelAgente(cont.Names) {
			continue
		}
		if err := c.api.ContainerRemove(ctx, cont.ID, container.RemoveOptions{Force: true}); err != nil {
			return eliminados, fmt.Errorf("eliminar huérfano %s: %w", cont.ID[:12], err)
		}
		eliminados++
	}
	return eliminados, nil
}

// esContenedorDelAgente filtra por el prefijo de nombre sys-scan-.
func esContenedorDelAgente(nombres []string) bool {
	for _, n := range nombres {
		if strings.HasPrefix(strings.TrimPrefix(n, "/"), PrefijoNombre) {
			return true
		}
	}
	return false
}

// puertoLibre reserva un puerto TCP libre en 127.0.0.1 y lo libera para que
// Docker lo use.
func puertoLibre() (int, error) {
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer lis.Close()
	return lis.Addr().(*net.TCPAddr).Port, nil
}
