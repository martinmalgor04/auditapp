# Imagen `sys-openaudit`

Open-AudIT Community sobre Ubuntu 24.04, construida desde el instalador
oficial de FirstWave pineado por versión y SHA-256 (R21). FirstWave no
publica imagen Docker oficial; las imágenes community de Docker Hub son una
cadena de suministro no auditada que correría con credenciales del cliente
adentro (ver design de #61, alternativas descartadas).

## Versión pineada

| Componente | Valor |
|---|---|
| Open-AudIT | 6.0.4 (release 2026-05-26) |
| SHA-256 instalador Linux | `38d78afbed2b4e950d8663be1b90942d04fb51dd0b29b1e9de1f4b0f12b04365` |
| Base | `ubuntu:24.04` |

Para actualizar: subir `OAE_VERSION` + `OAE_SHA256` (publicado en las release
notes oficiales) y bump de `rev` en el tag. El agente referencia la imagen
por **digest** pineado en `internal/dockerx` (actualizar la imagen = nueva
versión del agente, R21).

## Build y publicación (CI)

El workflow `ci/image.yml` construye multi-arch (`linux/amd64` +
`linux/arm64`) y publica en GHCR:

```
ghcr.io/serviciosysistemas/sys-openaudit:<oaeVersion>-<rev>
```

Build manual:

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/serviciosysistemas/sys-openaudit:6.0.4-1 \
  docker/sys-openaudit/
```

## Notas de diseño

- El instalador `.run` de FirstWave asume systemd; en contenedor se extrae
  con `--noexec --target` y los servicios (MariaDB, Apache) los arranca
  `entrypoint.sh`.
- El contenedor corre con `--rm` y API publicada solo en `127.0.0.1` (R22);
  su MariaDB interna se destruye al parar (parte de la purga de R10).
- ARP no atraviesa el NAT de Docker Desktop: el barrido ARP corre en el host
  (`internal/nmaphost`, R5); el discovery profundo sale por NAT (TCP/UDP
  saliente funciona).
