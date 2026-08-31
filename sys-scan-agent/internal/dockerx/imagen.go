package dockerx

// Referencia pineada de la imagen sys-openaudit (R21). El digest lo publica
// el CI de la imagen (ci/image.yml) y se actualiza acá con cada release del
// agente: actualizar la imagen = nueva versión del agente.
const (
	ImagenRepo = "ghcr.io/serviciosysistemas/sys-openaudit"
	ImagenTag  = "6.0.4-1"
	// ImagenDigest sha256 del manifest multi-arch. Vacío hasta la primera
	// publicación de CI; mientras tanto se referencia por tag con advertencia.
	ImagenDigest = ""
)

// Referencia devuelve la imagen a pullear: por digest cuando está pineado
// (R21), por tag como fallback de desarrollo.
func Referencia() string {
	if ImagenDigest != "" {
		return ImagenRepo + "@" + ImagenDigest
	}
	return ImagenRepo + ":" + ImagenTag
}

// DigestPineado reporta si hay digest que verificar post-pull.
func DigestPineado() (string, bool) {
	return ImagenDigest, ImagenDigest != ""
}
