# Deploy en Dokploy — auditapp

Runbook operativo para desplegar auditapp en Dokploy con Postgres en red interna, HTTPS Traefik y PWA.

## Dominio y HTTPS (UI Dokploy)

- **Dominio producción:** `https://app.auditoriaserviciosysistemas.com.ar`
- **Terminación TLS:** configurar en la UI de Dokploy (Let's Encrypt), **no** en el compose
- En Dokploy: servicio **app** → dominio custom → puerto interno **3000** (no cambiar a 3033 salvo que cambies `PORT` en el compose) → HTTPS automático
- `PUBLIC_APP_URL` debe coincidir con el dominio HTTPS

## Variables de entorno (producción)

Configurar en Dokploy (placeholders en `.env.example`):

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | `postgres://auditapp:***@postgres:5432/auditapp` (hostname interno `postgres`) |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `PUBLIC_APP_URL` | `https://app.auditoriaserviciosysistemas.com.ar` |
| `R2_ACCOUNT_ID` | Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 |
| `R2_BUCKET` | Nombre del bucket |
| `R2_ENDPOINT` | URL del endpoint R2 |
| `PORT` | `3000` (interno al contenedor) |

**Importante:** Postgres no expone puerto al host. Solo la app y Traefik son accesibles desde internet.

## Primer deploy

1. Crear proyecto en Dokploy con Postgres (sin publicar puerto) + app desde este repo.
2. Configurar variables de entorno anteriores.
3. Push a la rama conectada → Dokploy construye la imagen y arranca el contenedor.
4. El **entrypoint** ejecuta migraciones SQL y, si la DB está vacía, el seed inicial automático; luego `node build/index.js`.
5. Verificar health: `GET /health` → `{ "success": true, "data": { "status": "ok" } }`.

## Seed inicial (automático en primer deploy)

El **entrypoint** corre seed automáticamente **solo si la DB está vacía** (sin usuarios en `app_user`):

1. Deploy app + Postgres → entrypoint aplica migraciones.
2. Si no hay usuarios, ejecuta seed (admin, técnicos, plantillas, clientes CSV).
3. En restarts posteriores **omite** el seed (`[seed] skipped — database already initialized`).

Para desactivar el seed automático (DB vacía pero sin cargar datos seed):

```bash
AUTO_SEED=false
```

**Advertencia:** los usuarios seed traen contraseñas de ejemplo (`changeme-admin`, `changeme-tech`). Cambiarlas desde backoffice antes de uso real.

### Seed manual (opcional)

Si necesitás re-ejecutar o forzar datos seed en dev/staging:

```bash
pnpm run db:seed
# o en contenedor: docker exec <container_id> node docker/seed-cli.mjs
```

Re-ejecutar seed es idempotente (#2).

## Gate pre-push (obligatorio)

Antes de cada `git push` que dispara auto-deploy en Dokploy:

```bash
./scripts/pre-push.sh
```

El script ejecuta en orden:

1. `pnpm test`
2. `pnpm run build`
3. `docker build -t auditapp:pre-push .`

**No pushear con gate rojo.** Alias: `pnpm run prepush`.

Hook git opcional (instalar manualmente en `.git/hooks/pre-push`):

```bash
#!/usr/bin/env bash
./scripts/pre-push.sh
```

## PWA en producción

- Manifest: `/manifest.webmanifest`
- Service worker: `/sw.js`
- Íconos: `/icons/icon-192.png`, `/icons/icon-512.png`

Traefik: evitar cache agresivo del SW (`Cache-Control: no-cache` para `/sw.js` si aplica).

## Troubleshooting

| Problema | Causa probable | Acción |
|---|---|---|
| Contenedor reinicia en loop | Migración SQL falló | Revisar logs entrypoint; corregir SQL |
| `DATABASE_URL is not set` | Env faltante en Dokploy | Configurar variable |
| Postgres unreachable | Red interna / hostname | Usar `postgres` como host, no `localhost` |
| Cookie de sesión no persiste | `PUBLIC_APP_URL` sin `https://` | Alinear URL pública con Traefik |
| Healthcheck falla | App no escucha en `PORT` | Verificar `PORT=3000` en compose y puerto **3000** en UI Dokploy |
| 404 / dominio no llega a la app | App solo en red `internal` | Compose debe unir `app` a `dokploy-network`; redeploy |
| PWA manifest 404 | Build incompleto | Re-ejecutar pre-push gate |

## Referencia compose

Plantilla completa: `deploy/dokploy.compose.example.yml`
