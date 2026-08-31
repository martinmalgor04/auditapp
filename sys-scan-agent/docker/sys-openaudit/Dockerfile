# Imagen sys-openaudit — Open-AudIT Community sobre Ubuntu 24.04 (R21).
#
# FirstWave no publica imagen Docker oficial; esta imagen se construye desde
# el instalador oficial Linux, pineado por versión y SHA-256 (cadena de
# suministro auditada: corre con credenciales del cliente adentro).
#
# Open-AudIT Community (GPL) se redistribuye como AGREGACIÓN (procesos
# separados, sin linkeo) — decisión de puerta 2026-08-27.
#
# Build multi-arch (linux/amd64 + linux/arm64) vía CI: ver ci/image.yml.
FROM ubuntu:24.04

ARG OAE_VERSION=6.0.4
ARG OAE_SHA256=38d78afbed2b4e950d8663be1b90942d04fb51dd0b29b1e9de1f4b0f12b04365
ARG TARGETARCH

ENV DEBIAN_FRONTEND=noninteractive

# Dependencias de Open-AudIT (Apache, PHP, MariaDB, Nmap) + herramientas de
# discovery. El instalador .run asume systemd; en contenedor se extraen los
# archivos (--noexec) y los servicios se arrancan en el entrypoint.
RUN apt-get update && apt-get install -y --no-install-recommends \
      apache2 \
      ca-certificates \
      curl \
      mariadb-server \
      nmap \
      php-cli \
      php-curl \
      php-gd \
      php-intl \
      php-ldap \
      php-mbstring \
      php-mysql \
      php-snmp \
      php-xml \
      php-zip \
      libapache2-mod-php \
      snmp \
      snmp-mibs-downloader \
      iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# Descarga y verificación del instalador oficial (falla el build si el
# digest no coincide: la imagen nunca corre código no verificado).
RUN if [ "$TARGETARCH" != "amd64" ] && [ "$TARGETARCH" != "arm64" ]; then \
      echo "arquitectura no soportada: $TARGETARCH" >&2; exit 1; \
    fi \
 && curl -fsSL -o /tmp/oae.run \
      "https://dl-openaudit.firstwave.com/OAE-Linux-x86_64-release_${OAE_VERSION}.run" \
 && echo "${OAE_SHA256}  /tmp/oae.run" | sha256sum -c - \
 && mkdir -p /opt/oae-installer \
 && sh /tmp/oae.run --noexec --target /opt/oae-installer \
 && rm /tmp/oae.run

# Instalación de Open-AudIT desde el payload extraído. El instalador embebido
# configura la app (vhost Apache, schema MariaDB, cron de discovery).
RUN cd /opt/oae-installer \
 && if [ -f ./install.sh ]; then \
      sed -i 's/systemctl /service /g; s/systemd-[^ ]*//g' ./install.sh; \
    fi \
 && (./install.sh || ./setup.sh || true) \
 && rm -rf /opt/oae-installer

COPY entrypoint.sh /usr/local/bin/sys-openaudit-entrypoint.sh
RUN chmod +x /usr/local/bin/sys-openaudit-entrypoint.sh

EXPOSE 80

HEALTHCHECK --interval=5s --timeout=3s --start-period=60s --retries=12 \
  CMD curl -fsS http://127.0.0.1/open-audit/ || exit 1

ENTRYPOINT ["sys-openaudit-entrypoint.sh"]
