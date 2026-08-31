#!/bin/bash
# Entrypoint de sys-openaudit: el contenedor es efímero por escaneo (--rm,
# R22). Arranca MariaDB + Apache sin systemd y queda en foreground.
set -e

# MariaDB: inicializar el datadir si el instalador no lo hizo (primer boot
# de esta capa de contenedor).
if [ ! -d /var/lib/mysql/mysql ]; then
  mariadb-install-db --user=mysql --datadir=/var/lib/mysql >/dev/null
fi
install -d -o mysql -g mysql /run/mysqld
mysqld_safe --datadir=/var/lib/mysql &

# Apache en foreground (mantiene vivo el contenedor).
exec apache2ctl -D FOREGROUND
