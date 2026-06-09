# Deploy en Dokploy — auditapp

Runbook operativo para desplegar auditapp en Dokploy con Postgres, HTTPS y PWA.

## Dominio y HTTPS (UI Dokploy)

- **Dominio producción:** `https://app.auditoriaserviciosysistemas.com.ar`
- **Terminación TLS:** configurar en la UI de Dokploy (Let's Encrypt), **no** en el compose
- En Dokploy: servicio **app** → dominio custom → puerto interno **3033** → HTTPS automático
- `PUBLIC_APP_URL` debe coincidir con el dominio HTTPS

## Variables de entorno (producción)

Configurar en Dokploy:

| Variable | Descripción |
|---|---|
| `POSTGRES_PASSWORD` | Password del usuario `auditapp` (Postgres **y** app la usan) |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `PUBLIC_APP_URL` | `https://app.auditoriaserviciosysistemas.com.ar` |
| `R2_ACCOUNT_ID` | Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 |
| `R2_BUCKET` | Nombre del bucket |
| `R2_ENDPOINT` | URL del endpoint R2 |

Opcionales (Postgres admin):

| Variable | Descripción |
|---|---|
| `POSTGRES_PUBLISH_BIND` | Bind del puerto host (default `127.0.0.1`) |
| `POSTGRES_ALLOWED_CIDRS` | IPs/CIDRs extra permitidas en `pg_hba` (comma-separated) |

**No configurar `DATABASE_URL` en Dokploy.** El entrypoint la arma desde `POSTGRES_PASSWORD` dentro del contenedor app (evita desync con Postgres).

**No configurar `PORT` en Dokploy.** El compose ya fija `3033` para la app.

## Postgres expuesto (puerto 4043)

Postgres se publica en el **host** en el puerto **4043** → contenedor `5432`.

- **Default:** bind `127.0.0.1:4043` — solo accesible desde el servidor (recomendado).
- **App interna:** sigue usando `postgres:5432` en la red Docker (sin cambios).

### Conectar desde tu PC (túnel SSH)

```bash
ssh -L 4043:127.0.0.1:4043 usuario@tu-servidor-dokploy
```

Luego en DBeaver / psql:

```
Host: 127.0.0.1
Port: 4043
Database: auditapp
User: auditapp
Password: <POSTGRES_PASSWORD>
```

### Acceso directo desde internet (no recomendado)

Solo si lo necesitás y reforzás firewall:

1. `POSTGRES_PUBLISH_BIND=0.0.0.0`
2. `POSTGRES_ALLOWED_CIDRS=tu.ip.publica/32` (o rango de oficina)
3. Firewall en el servidor: `ufw allow from TU_IP to any port 4043`

### Políticas de seguridad Postgres

Imagen `docker/postgres` con:

- Autenticación **scram-sha-256** (no `trust` en red)
- `pg_hba`: solo usuario `auditapp` → DB `auditapp`
- Redes privadas Docker (172.16/12, 10/8, 192.168/16) + CIDRs opcionales
- **Reject** explícito para todo lo demás
- Log de conexiones/desconexiones activado

## Primer deploy

1. Crear proyecto Compose en Dokploy desde este repo.
2. Configurar variables de entorno (sin `DATABASE_URL`).
3. Push → Dokploy construye imagen app + postgres y arranca.
4. Entrypoint: migraciones → seed si DB vacía → `node build/index.js`.
5. Verificar: `GET /health` → `{ "success": true, "data": { "status": "ok" } }`.

## Seed inicial (automático)

El entrypoint corre seed **solo si la DB está vacía** (sin usuarios en `app_user`).

Para desactivar: `AUTO_SEED=false`

**Advertencia:** contraseñas seed de ejemplo (`changeme-admin`, `changeme-tech`). Cambiarlas en prod.

## Gate pre-push

```bash
./scripts/pre-push.sh
```

Alias: `pnpm run prepush`

## Troubleshooting

| Problema | Causa probable | Acción |
|---|---|---|
| `28P01 password authentication failed` | `DATABASE_URL` manual en Dokploy o password vieja en volumen | Quitar `DATABASE_URL`; borrar volumen `auditapp_pgdata`; redeploy |
| Contenedor reinicia en loop | Migración SQL falló | Logs entrypoint |
| Postgres unreachable desde app | Hostname incorrecto | App usa `postgres:5432`, no `localhost` |
| No puedo conectar al 4043 | Bind en 127.0.0.1 | Usar túnel SSH o `POSTGRES_PUBLISH_BIND=0.0.0.0` + firewall |
| Conexión rechazada en 4043 | IP no permitida en pg_hba | Agregar `POSTGRES_ALLOWED_CIDRS` |
| 404 dominio app | App fuera de `dokploy-network` | Ver compose; redeploy |
| Healthcheck falla | Puerto UI ≠ 3033 | Dokploy servicio app → puerto **3033** |

## Referencia compose

`deploy/dokploy.compose.example.yml`
