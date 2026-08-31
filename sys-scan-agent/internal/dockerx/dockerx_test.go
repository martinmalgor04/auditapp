package dockerx

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/containerd/errdefs"
	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	ocispec "github.com/opencontainers/image-spec/specs-go/v1"
)

// fakeDocker implementa DockerAPI en memoria.
type fakeDocker struct {
	pingErr      error
	imagenLocal  bool
	repoDigests  []string
	pullStream   string
	contenedores []container.Summary
	creados      []string // nombres de contenedores creados
	eliminados   []string
	parados      []string
	corriendo    map[string]bool

	ultimoCreate *container.Config
	ultimoHost   *container.HostConfig
}

func (f *fakeDocker) Ping(context.Context) (types.Ping, error) {
	return types.Ping{}, f.pingErr
}

func (f *fakeDocker) ImagePull(_ context.Context, _ string, _ image.PullOptions) (io.ReadCloser, error) {
	stream := f.pullStream
	if stream == "" {
		stream = `{"status":"Pulling from sys-openaudit"}` + "\n"
	}
	return io.NopCloser(strings.NewReader(stream)), nil
}

func (f *fakeDocker) ImageInspect(_ context.Context, _ string, _ ...client.ImageInspectOption) (image.InspectResponse, error) {
	if !f.imagenLocal {
		return image.InspectResponse{}, errors.New("No such image")
	}
	return image.InspectResponse{RepoDigests: f.repoDigests}, nil
}

func (f *fakeDocker) ContainerCreate(_ context.Context, config *container.Config, host *container.HostConfig, _ *network.NetworkingConfig, _ *ocispec.Platform, nombre string) (container.CreateResponse, error) {
	f.creados = append(f.creados, nombre)
	f.ultimoCreate = config
	f.ultimoHost = host
	if f.corriendo == nil {
		f.corriendo = map[string]bool{}
	}
	f.corriendo["id-"+nombre] = true
	return container.CreateResponse{ID: "id-" + nombre}, nil
}

func (f *fakeDocker) ContainerStart(_ context.Context, id string, _ container.StartOptions) error {
	f.corriendo[id] = true
	return nil
}

func (f *fakeDocker) ContainerStop(_ context.Context, id string, _ container.StopOptions) error {
	f.parados = append(f.parados, id)
	f.corriendo[id] = false
	return nil
}

func (f *fakeDocker) ContainerList(_ context.Context, _ container.ListOptions) ([]container.Summary, error) {
	return f.contenedores, nil
}

func (f *fakeDocker) ContainerInspect(_ context.Context, id string) (container.InspectResponse, error) {
	vivo, ok := f.corriendo[id]
	if !ok {
		return container.InspectResponse{}, errdefs.ErrNotFound
	}
	return container.InspectResponse{
		ContainerJSONBase: &container.ContainerJSONBase{
			State: &container.State{Running: vivo},
		},
	}, nil
}

func (f *fakeDocker) ContainerRemove(_ context.Context, id string, _ container.RemoveOptions) error {
	f.eliminados = append(f.eliminados, id)
	return nil
}

func TestNuevoFallaSinDaemon(t *testing.T) {
	_, err := NuevoConAPI(context.Background(), &fakeDocker{pingErr: errors.New("cannot connect to the Docker daemon")})
	if !errors.Is(err, ErrDockerNoDisponible) {
		t.Fatalf("esperaba ErrDockerNoDisponible, vino %v", err)
	}
}

func TestAsegurarImagenYaLocalSinDigestPineado(t *testing.T) {
	fake := &fakeDocker{imagenLocal: true}
	c, err := NuevoConAPI(context.Background(), fake)
	if err != nil {
		t.Fatalf("NuevoConAPI: %v", err)
	}
	// Sin digest pineado (dev) e imagen local: no baja nada
	if err := c.AsegurarImagen(context.Background(), nil); err != nil {
		t.Fatalf("AsegurarImagen: %v", err)
	}
}

func TestAsegurarImagenReportaProgreso(t *testing.T) {
	stream := `{"id":"capa1","status":"Downloading","progressDetail":{"current":50,"total":100}}` + "\n" +
		`{"id":"capa1","status":"Downloading","progressDetail":{"current":100,"total":100}}` + "\n" +
		`{"id":"capa2","status":"Downloading","progressDetail":{"current":25,"total":100}}` + "\n"
	fake := &fakeDocker{imagenLocal: false, pullStream: stream}
	// Tras el pull, ImageInspect debe encontrarla
	c, err := NuevoConAPI(context.Background(), fake)
	if err != nil {
		t.Fatalf("NuevoConAPI: %v", err)
	}

	var ultimos []ProgresoPull
	err = c.AsegurarImagen(context.Background(), func(p ProgresoPull) { ultimos = append(ultimos, p) })
	// imagenLocal sigue false → ImageInspect post-pull falla → error esperado
	if err == nil {
		t.Fatalf("debería fallar la verificación post-pull sin imagen inspeccionable")
	}
	if len(ultimos) == 0 {
		t.Fatalf("no se reportó progreso")
	}
	// El porcentaje agregado de la última línea: (100+25)/(100+100) = 62%
	if ultimos[len(ultimos)-1].Porcentaje != 62 {
		t.Fatalf("porcentaje agregado mal calculado: %d", ultimos[len(ultimos)-1].Porcentaje)
	}
}

func TestAsegurarImagenFallaConErrorDeStream(t *testing.T) {
	stream := `{"errorDetail":{"message":"manifest unknown"},"error":"manifest unknown"}` + "\n"
	fake := &fakeDocker{imagenLocal: false, pullStream: stream}
	c, _ := NuevoConAPI(context.Background(), fake)

	err := c.AsegurarImagen(context.Background(), nil)
	if err == nil || !strings.Contains(err.Error(), "manifest unknown") {
		t.Fatalf("el error del stream debería propagarse: %v", err)
	}
}

func TestLevantarContenedorSoloLocalhostYAutoRemove(t *testing.T) {
	fake := &fakeDocker{}
	c, _ := NuevoConAPI(context.Background(), fake)

	cont, err := c.LevantarContenedor(context.Background(), "abcdef1234567890")
	if err != nil {
		t.Fatalf("LevantarContenedor: %v", err)
	}

	// Nombre con prefijo + escaneoId8 (R24)
	if cont.Nombre != "sys-scan-abcdef12" {
		t.Fatalf("nombre inesperado: %s", cont.Nombre)
	}
	// AutoRemove (--rm, R10/R22)
	if !fake.ultimoHost.AutoRemove {
		t.Fatalf("el contenedor debe ser --rm")
	}
	// Puerto publicado solo en 127.0.0.1 (R22)
	bindings := fake.ultimoHost.PortBindings["80/tcp"]
	if len(bindings) != 1 || bindings[0].HostIP != "127.0.0.1" {
		t.Fatalf("la API debe publicarse solo en localhost: %+v", bindings)
	}
	if cont.PuertoHost <= 0 {
		t.Fatalf("puerto host inválido: %d", cont.PuertoHost)
	}
	if !strings.HasPrefix(cont.BaseURL(), "http://127.0.0.1:") {
		t.Fatalf("BaseURL debe ser localhost: %s", cont.BaseURL())
	}
}

func TestLimpiarHuerfanosSoloSysScan(t *testing.T) {
	fake := &fakeDocker{
		contenedores: []container.Summary{
			{ID: "aaa", Names: []string{"/sys-scan-deadbeef"}},
			{ID: "bbb", Names: []string{"/sys-scan-12345678"}},
			{ID: "ccc", Names: []string{"/otro-contenedor"}},
			{ID: "ddd", Names: []string{"/sys-openaudit-base"}},
		},
	}
	c, _ := NuevoConAPI(context.Background(), fake)

	n, err := c.LimpiarHuerfanos(context.Background())
	if err != nil {
		t.Fatalf("LimpiarHuerfanos: %v", err)
	}
	if n != 2 {
		t.Fatalf("debería eliminar 2 huérfanos, eliminó %d", n)
	}
	for _, id := range fake.eliminados {
		if id != "aaa" && id != "bbb" {
			t.Fatalf("eliminó un contenedor ajeno: %s", id)
		}
	}
}

func TestContenedorVivo(t *testing.T) {
	fake := &fakeDocker{corriendo: map[string]bool{"id-vivo": true, "id-muerto": false}}
	c, _ := NuevoConAPI(context.Background(), fake)

	vivo, err := c.ContenedorVivo(context.Background(), "id-vivo")
	if err != nil || !vivo {
		t.Fatalf("id-vivo debería estar vivo: %v %v", vivo, err)
	}
	vivo, err = c.ContenedorVivo(context.Background(), "id-muerto")
	if err != nil || vivo {
		t.Fatalf("id-muerto no debería estar vivo")
	}
	// Contenedor inexistente → no vivo, sin error (R32 lo trata como muerto)
	vivo, err = c.ContenedorVivo(context.Background(), "inexistente")
	if err != nil || vivo {
		t.Fatalf("inexistente debería ser no-vivo sin error: %v %v", vivo, err)
	}
}

func TestDetenerContenedor(t *testing.T) {
	fake := &fakeDocker{corriendo: map[string]bool{"id-x": true}}
	c, _ := NuevoConAPI(context.Background(), fake)

	if err := c.DetenerContenedor(context.Background(), "id-x"); err != nil {
		t.Fatalf("DetenerContenedor: %v", err)
	}
	if len(fake.parados) != 1 || fake.parados[0] != "id-x" {
		t.Fatalf("no se paró el contenedor: %v", fake.parados)
	}
}

func TestEsperarDaemonTimeout(t *testing.T) {
	fake := &fakeDocker{pingErr: errors.New("cannot connect")}
	ctx := context.Background()
	inicio := time.Now()
	err := esperarDaemon(ctx, fake, 200*time.Millisecond)
	if err == nil || !errors.Is(err, ErrDockerNoDisponible) {
		t.Fatalf("esperaba timeout con ErrDockerNoDisponible: %v", err)
	}
	if time.Since(inicio) > 5*time.Second {
		t.Fatalf("el timeout no se respetó")
	}
}
