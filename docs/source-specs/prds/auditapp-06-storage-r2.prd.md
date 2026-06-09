# auditapp — Storage R2 y adjuntos

**ID**: SPEC-07g | **Padre**: [auditapp.prd.md](auditapp.prd.md) | **Milestone**: 6 de 8 | **Depende de**: 07a, 07b

---

## Problem

Las plantillas IT/ERP piden fotos (`[C]` captura) y exports/archivos (`[X]`) en docenas de ítems: rack, cableado, topología de red, licencias, planillas de inventario. Esos binarios no pueden ir en Postgres y no deben pasar por el servidor SvelteKit — necesitan ir directo a un bucket de almacenamiento. Sin storage los ítems `file_ref` quedan sin implementar y la auditoría queda incompleta.

## Evidence

- Las plantillas v2 tienen ~15-20 ítems con `method` incluyendo `[C]` (captura) o `[X]` (export).
- Los técnicos sacan fotos con el iPhone — las fotos HEIC sin comprimir pesan 5-10 MB cada una; sin compresión en cliente el técnico quema datos móviles en campo.
- Cloudflare R2 tiene egress gratuito — ver/descargar fotos en el backoffice no genera costo de tráfico.

## Users

- **Primary — Técnico**: toma foto desde el celular, la sube vinculada al ítem que corresponde.
- **Secondary — Admin**: ve los adjuntos en el backoffice al revisar la auditoría.
- **Not for**: clientes — no tienen acceso a adjuntos técnicos.

## Hypothesis

Creemos que subida directa del cliente al bucket R2 vía presigned URLs, con compresión en cliente y validación server-side, permitirá al técnico subir fotos en campo sin sobrecargar el servidor ni agotar sus datos móviles. Sabremos que funciona cuando el técnico suba una foto y quede vinculada al ítem correcto, visible desde el backoffice.

## Success Metrics

| Métrica | Target | Cómo medir |
|---|---|---|
| Subida sin pasar por el servidor | 100% vía presigned PUT | Inspección de network requests |
| Fotos comprimidas antes de subir | < 500 KB promedio por foto | Medir en test con fotos reales de iPhone |
| Foto vinculada al ítem correcto | 100% — `attachment.item_id` correcto | Test de integración |

## Scope

**MVP** — Presigned PUT para subida directa con **`aws4fetch`** (liviano, S3-compatible, anda perfecto con R2), presigned GET para descarga, tabla `attachment` vinculada a `audit` e `item_id`, compresión en cliente (≤1600px, quality 0.8, target ~300-500 KB), validación de tipo y tamaño (máx 25 MB pre-compresión), HEIC → JPEG en cliente. Bucket privado. **Job automatizado** de limpieza de objetos huérfanos / auditorías borradas.

**Out of scope**

- **Thumbnails en backoffice — descartado** (no se hacen).
- Subida de fotos desde el briefing del cliente (v1: solo el técnico sube).
- CDN pública para assets (bucket es privado, siempre presigned).

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 6a | Presigned PUT y tabla attachment | Endpoint server-side genera URL firmada; cliente sube directo a R2; crea fila attachment | pending | — |
| 6b | Presigned GET y preview | Endpoint de descarga con URL firmada de corta vida; preview en backoffice | pending | — |
| 6c | Compresión y validación | Resize a 1600px + quality 0.8 en cliente (target ~300-500 KB); validación content_type + tamaño server-side | pending | — |
| 6d | Job de limpieza automatizado | Job programado que borra de R2 los objetos huérfanos y los de auditorías borradas | pending | — |

## Open Questions

- [x] ~~Tamaño máximo por archivo~~ — **✅ Recomendado: 25 MB pre-compresión; las fotos se comprimen a ~300-500 KB antes de subir.**
- [x] ~~Librería de subida~~ — **✅ `aws4fetch`** (liviano, funciona muy bien con el S3 de Cloudflare R2; evita el peso de `@aws-sdk/client-s3`).
- [x] ~~Job de limpieza de huérfanos~~ — **✅ SÍ, automatizado** (job programado, no manual).
- [x] ~~Convención de key sin sección~~ — **✅ `audits/{audit_id}/_general/{uuid}.{ext}`** para adjuntos del cierre / generales (carpeta `_general`).

## Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| CORS mal configurado en R2 | Media | Alto | Configurar CORS en R2 con el dominio de la app antes de las pruebas |
| Fotos HEIC no convertibles en todos los browsers | Media | Bajo | Librería de conversión en cliente (canvas o lib liviana) |
| Presigned URL vencida si el técnico tarda en subir | Baja | Bajo | TTL generoso (15 min); regenerar si vence |

---

## Spec técnica de referencia

### Flujo de subida

1. Cliente pide al server presigned PUT URL (autenticado como técnico o con token de cliente si aplica).
2. Server valida: auditoría activa, ítem existe, permiso OK → genera key + presigned URL (TTL 15 min).
3. Cliente sube directo a R2 con PUT.
4. Cliente confirma al server → server crea fila `attachment`.

### Convención de key

```
audits/{audit_id}/{section_code}/{item_id}/{uuid}.{ext}
audits/{audit_id}/_general/{uuid}.{ext}          # adjuntos del cierre / sin sección
```
Ejemplo: `audits/abc.../A11/def.../foto-rack.jpg` · `audits/abc.../_general/anexo.pdf`

### Variables de entorno

```
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT
```
Nunca expuestas al cliente. Firmas generadas solo en el servidor.

### Compresión en cliente

```javascript
// Pseudocódigo
resize(image, maxWidth=1600) → canvas → toBlob(quality=0.8, type='image/jpeg')
```
HEIC: convertir a JPEG antes de resize.

---

*Status: DRAFT. Spec de referencia completa en [`specs/06_storage_r2/requirements.md`](../../specs/06_storage_r2/spec.md).*
