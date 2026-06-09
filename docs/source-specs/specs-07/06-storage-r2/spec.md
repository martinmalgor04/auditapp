# Spec 07g — Storage R2 y adjuntos

| Campo | Valor |
|---|---|
| **ID** | SPEC-07g |
| **Estado** | 🟢 Definido |
| **Owner** | Martín Malgor |
| **Padre** | [SPEC-07 sysaudit-app](../spec.md) |
| **Especifica** | Subida y gestión de fotos/exports en Cloudflare R2 |

---

## 1. Propósito

Las plantillas piden **fotos** (`[C]` captura) y **exports/archivos** (`[X]`) en muchos ítems (rack, cableado, topología, licencias, etc.). Esos binarios no van en Postgres: van a un **bucket Cloudflare R2** (S3-compatible). Postgres guarda solo la referencia (`attachment`, [07a §3.3](../02-modelo-datos/spec.md)).

---

## 2. Por qué R2

- S3-compatible → SDK estándar (`@aws-sdk/client-s3` o `aws4fetch` liviano).
- **Sin costo de egress** → ver/descargar fotos no genera factura por tráfico.
- Barato y desacoplado del servidor Dokploy.

---

## 3. Flujo de subida (presigned URL)

Para no pasar binarios por el servidor SvelteKit:

1. El cliente del form pide al server una **presigned PUT URL** (endpoint protegido por sesión técnico, o por token de cliente si el ítem es del briefing).
2. El server valida (auditoría/ítem/permiso), genera la key y devuelve la URL firmada (vencimiento corto).
3. El navegador sube **directo a R2** con PUT.
4. Al confirmar, el server crea la fila `attachment` (r2_key, filename, content_type, size, kind, uploaded_by).

Descarga/preview: presigned **GET** URL de corta vida (el bucket es privado, no público).

---

## 4. Convención de keys

```
audits/{audit_id}/{section_code}/{item_id}/{uuid}.{ext}
```

Ej: `audits/abc.../A11/def.../foto-rack.jpg`. Facilita ubicar y borrar por auditoría/sección.

---

## 5. Reglas

- **Bucket privado.** Todo acceso vía presigned URLs; nada público.
- **Tipos permitidos:** imágenes (jpg/png/webp/heic) y documentos (pdf, xlsx, csv, txt). Validar `content_type` y tamaño máx (p. ej. 25 MB).
- **Compresión de fotos** en el cliente antes de subir (resize a ~1600px, calidad ~0.8) para ahorrar datos del técnico en campo.
- **HEIC → JPEG:** los iPhones sacan HEIC; convertir en cliente o aceptar HEIC y normalizar.
- **Borrado diferido:** borrar una auditoría no borra en caliente; los objetos se encolan y se limpian en batch (job).
- `attachment.r2_key` único; integridad referencial con `audit`/`template_item`.

---

## 6. Configuración (env)

Variables (detalle en [SPEC-07h](../10-deploy-dokploy/spec.md)): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`. Nunca en el cliente; las firmas se generan en el server.

---

## 7. Dependencias

- Tabla `attachment` y el `field_type='file_ref'`: [SPEC-07a](../02-modelo-datos/spec.md).
- Consumido por el form técnico ([07e](../07-form-tecnico-mobile/spec.md)) y, para fotos del briefing, por [07d](../05-briefing-externo/spec.md).
- Permisos de quién puede pedir presigned URL: [SPEC-07b](../03-auth-roles/spec.md).

---

## 8. Criterios de aceptación

- [ ] El técnico saca una foto y sube directo a R2 vía presigned URL, sin pasar por el server.
- [ ] La foto queda vinculada al ítem correcto (`attachment.item_id`).
- [ ] El bucket es privado; las fotos se ven solo vía presigned GET.
- [ ] Se valida tipo y tamaño; las fotos se comprimen antes de subir.
- [ ] Borrar una auditoría encola sus objetos para limpieza, sin romper referencias.

---

## 9. Estado y pendientes

- [ ] Definir tamaño máximo y parámetros de compresión finos.
- [ ] Decidir librería de subida (`@aws-sdk/client-s3` vs `aws4fetch`).
- [ ] Job de limpieza de objetos huérfanos / auditorías borradas.
- [ ] ¿Thumbnails para el backoffice? — opcional v2.
