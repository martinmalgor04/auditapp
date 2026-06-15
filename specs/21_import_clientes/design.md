# Design — #21 21_import_clientes

## Visión

Una acción **dentro de la vista CRM** (`src/routes/(app)/crm`) que sube un archivo **CSV o
.xlsx**, lo parsea a un arreglo uniforme de filas, valida fila por fila con **Zod**, hace
**match por CUIT** y **upsert** sobre `client`, todo en una sola transacción, y devuelve un
**reporte por fila** que la UI muestra al admin.

El núcleo de dominio es **agnóstico al formato**: ambos parsers (CSV y xlsx) producen el mismo
`Record<string, string>[]` con encabezados como claves; de ahí en adelante el código de
normalización/validación/upsert es uno solo. Esto sigue el patrón del seed
(`src/lib/server/db/seed/clients.ts`) y del batch de leads
(`src/routes/api/crm/leads/batch/+server.ts`).

Capas (per `docs/architecture.md`):

- `src/lib/server/clients/` — **dominio nuevo**: parse (CSV+xlsx), normalización, schema Zod,
  errores. Sin DB ni HTTP.
- `src/lib/server/db/clients-import.ts` — escritura SQL pura (upsert por CUIT en transacción).
- `src/routes/api/crm/clients/import/+server.ts` — endpoint API admin-only (multipart).
- `src/routes/(app)/crm/+page.svelte` + `+page.server.ts` — UI: form de subida + reporte.
- `migrations/013_client_cuit_index.sql` — índice de soporte para match por CUIT.

Reusa: `emptyToNull` (criterio del seed), `csv-parse/sync` (ya en deps), envelope
`apiSuccess`/`apiError`, `requireAdminApi`, `getSql`.

---

## Decisión: parser de .xlsx (cerrada en puerta humana)

CSV ya está cubierto por `csv-parse/sync`. Para `.xlsx` hace falta una dependencia nueva (no
existe hoy en `package.json`/lockfile).

**Elegido: `node-xlsx`** (`pnpm add node-xlsx`) — decisión fija de Martín (2026-06-15): la opción
más liviana.

API verificada (npm/GitHub `mgcrea/node-xlsx`):

```ts
import xlsx from 'node-xlsx';            // DEFAULT export (no named)
// CommonJS equivalente: require('node-xlsx').default

const sheets = xlsx.parse(buffer);       // Buffer | string(path); aquí Buffer
// sheets: Array<{ name: string; data: unknown[][] }>
// data = array de filas, cada fila = array de celdas. NO hay manejo de header:
// la 1ª fila (data[0]) son los encabezados y hay que derivarlos a mano.
```

Notas de uso para esta feature:

- Entrada: el upload llega como `File`; convertir con `Buffer.from(await file.arrayBuffer())` y
  pasarlo a `xlsx.parse(buffer)`.
- Tomamos **la primera hoja** (`sheets[0]`). Si no hay hojas o la hoja está vacía → 0 filas.
- **Derivar encabezados** de `data[0]` (normalizando a string + trim + lowercase para el
  aliasing); las filas de datos son `data.slice(1)`. Cada fila se reconstruye a `RawRow`
  (`Record<string,string>`) zippeando encabezados↔celdas, convirtiendo cada celda a string
  (`String(cell ?? '')`) para uniformar con la salida de `csv-parse` (que ya entrega strings).
- Filas totalmente vacías (todas las celdas vacías) se descartan antes de numerar.
- Solo se importa en server (`src/lib/server/clients/`), nunca en el bundle de cliente.

**Alternativa descartada — `exceljs`:** más pesado (manejo de estilos, streaming, fórmulas) del
que esta feature necesita; Martín pidió explícitamente la opción más liviana. `node-xlsx` es un
wrapper fino sobre el core de SheetJS con superficie mínima (`parse`/`build`).

**Alternativa descartada — `xlsx` (SheetJS directo, paquete `xlsx` de npm):** la versión publicada
en el registro npm está desactualizada y arrastra avisos de vulnerabilidad (prototype pollution /
ReDoS) sin fix en ese canal. `node-xlsx` encapsula el core y se instala limpio desde npm.

---

## Esquema de fila (Zod)

`src/lib/server/clients/schema.ts`:

```ts
import { z } from 'zod';

/** Normaliza CUIT a solo dígitos. '30-12345678-9' -> '30123456789'. */
export function normalizeCuit(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

/** Fila ya normalizada (vacíos -> null, cuit -> dígitos) lista para validar. */
export const clientImportRowSchema = z.object({
  razon_social: z.string().trim().min(1, 'razon_social obligatoria'),
  cuit: z
    .string()
    .regex(/^\d{11}$/, 'CUIT debe tener 11 dígitos')
    .nullable(),
  direccion: z.string().nullable(),
  cp: z.string().nullable(),
  provincia: z.string().nullable(),
  telefono: z.string().nullable(),
  email: z.string().nullable()
});

export type ClientImportRow = z.infer<typeof clientImportRowSchema>;
```

> Nota de negocio (decisión de puerta, R9.bis): el CUIT es **nullable** a nivel de columna
> `client.cuit`, pero la **política de upsert es por CUIT**. Una fila válida **sin** CUIT no puede
> deduplicarse → se cuenta como **omitida** (`skipped`, motivo "sin CUIT, no deduplicable"), en una
> categoría **separada de `invalid`**, y nunca se crea ni se actualiza. Esto se decide en el
> dominio (`planClientImport`), no en el schema. Ver R9.bis/R13.

---

## Parse agnóstico al formato

`src/lib/server/clients/parse.ts`:

```ts
export type RawRow = Record<string, string>;

/** CSV -> filas con encabezados como claves (csv-parse/sync, igual que el seed). */
export function parseCsv(content: string): RawRow[];

/** .xlsx (primera hoja) -> filas con encabezados como claves (node-xlsx, SÍNCRONO).
 *  Deriva encabezados de data[0], zippea con data.slice(1), celdas -> string. */
export function parseXlsx(buffer: Buffer): RawRow[];

/** Despacha por content-type / extensión. Lanza UnsupportedFormatError si no aplica. */
export function detectFormat(filename: string, contentType: string): 'csv' | 'xlsx';
```

> `parseXlsx` es **síncrono** (node-xlsx `parse` lo es); el endpoint hace `await file.arrayBuffer()`
> solo para obtener el `Buffer`, no para parsear.

### Set canónico y aliasing (R5 / R5.bis / R5.ter)

`src/lib/server/clients/normalize.ts`:

```ts
/** Columnas que el CRM persiste. NADA fuera de este set toca la DB. */
export const CANONICAL_FIELDS = [
  'razon_social', 'cuit', 'direccion', 'cp', 'provincia', 'telefono', 'email'
] as const;

/** Encabezado de entrada (trim+lowercase) -> campo canónico. Cubre el aliasing. */
export const HEADER_ALIASES: Record<string, (typeof CANONICAL_FIELDS)[number]> = {
  'razon_social': 'razon_social',
  'razón social': 'razon_social',   // alias acentuado
  'razon social': 'razon_social',   // tolerancia sin acento
  'cuit': 'cuit',
  'numero_doc': 'cuit',             // alias del CSV fuente
  'direccion': 'direccion',
  'dirección': 'direccion',
  'cp': 'cp',
  'provincia': 'provincia',
  'telefono': 'telefono',
  'teléfono': 'telefono',
  'email': 'email'
};

export type NormalizedRow = {
  razon_social: string;
  cuit: string | null;
  direccion: string | null;
  cp: string | null;
  provincia: string | null;
  telefono: string | null;
  email: string | null;
};

/** Aplica HEADER_ALIASES (descartando columnas desconocidas), emptyToNull y normalizeCuit. */
export function normalizeRow(raw: RawRow): NormalizedRow;

/** Inspecciona los encabezados del archivo y devuelve cuáles se ignoran (R5.ter). */
export function inspectHeaders(headers: string[]): { mapped: string[]; ignored: string[] };
```

**Set canónico final (decisión de puerta):** `razon_social` (obligatoria), `cuit`, `direccion`,
`cp`, `provincia`, `telefono`, `email`. **`categoria_iva` queda descartada** (no se agrega columna
a `client`). Cualquier encabezado fuera de `HEADER_ALIASES` (`id`, `categoria_iva`, `created_at`,
`updated_at`, columnas extra) se **ignora silenciosamente** en la persistencia, pero
`inspectHeaders` lo reporta (conteo + nombres) para el reporte de resultado.

---

## Construcción del reporte (dominio)

`src/lib/server/clients/import.ts`:

```ts
export type RowError = { row: number; reason: string };

export type ImportPlan = {
  total: number;            // filas de datos leídas
  valid: ClientImportRow[]; // listas para upsert (dedupe por CUIT, última gana)
  skipped: RowError[];      // válidas SIN CUIT -> no deduplicables (R9.bis)
  invalid: RowError[];      // fallaron Zod (razon_social / formato CUIT)
  ignoredColumns: string[]; // encabezados no canónicos descartados (R5.ter)
};

/** Parsea+normaliza+valida; NO toca DB. Numera filas 1-based sobre datos.
 *  Recibe también los encabezados crudos para poblar ignoredColumns. */
export function planClientImport(rows: RawRow[], headers: string[]): ImportPlan;
```

`row` en los errores es el número de fila de **datos** (1-based, sin contar el encabezado).

---

## Escritura DB (upsert por CUIT en transacción)

`src/lib/server/db/clients-import.ts`:

```ts
export type ImportResult = {
  total: number;
  created: number;
  updated: number;
  skipped: RowError[];        // categoría separada de invalid (R13)
  invalid: RowError[];
  ignoredColumns: string[];   // R5.ter — informado en el reporte
};

/** Aplica el plan en una transacción. created/updated por match de CUIT. */
export function applyClientImport(plan: ImportPlan): Promise<ImportResult>;
```

SQL por fila válida (dentro de `sql.begin`):

```sql
-- match por cuit; created vs updated según exista
INSERT INTO client (razon_social, cuit, direccion, cp, provincia, telefono, email, origen)
VALUES ($1, $2, $3, $4, $5, $6, $7, 'presupuestos')
ON CONFLICT (cuit) WHERE cuit IS NOT NULL DO UPDATE SET
  razon_social = EXCLUDED.razon_social,
  direccion    = EXCLUDED.direccion,
  cp           = EXCLUDED.cp,
  provincia    = EXCLUDED.provincia,
  telefono     = EXCLUDED.telefono,
  email        = EXCLUDED.email,
  updated_at   = now()
  -- origen NO se toca (R11)
RETURNING (xmax = 0) AS inserted;  -- true=created, false=updated
```

> `xmax = 0` distingue insert de update en el `RETURNING` de un upsert (patrón postgres). Como las
> filas sin CUIT ya quedaron en `skipped` (no llegan acá), el `WHERE cuit IS NOT NULL` del índice
> parcial siempre aplica.

---

## Migración: limpieza de duplicados + índice único parcial sobre CUIT (R17/R18)

El seed `clientes-presupuestossys.csv` (~1905 filas, feature #2) puede traer CUIT repetidos. Si
existen, `CREATE UNIQUE INDEX` falla. La migración **limpia/mergea primero, crea el índice
después**, en una sola transacción idempotente.

`migrations/013_client_cuit_index.sql`:

```sql
-- #21 — Índice único parcial sobre CUIT para upsert ON CONFLICT.
-- Paso 1 (R17/R18): consolidar CUIT duplicados ANTES de crear el índice.
-- Estrategia: conservar la fila de id MENOR (la más antigua) por CUIT, borrar el resto.
-- (No hay FKs hacia client.cuit; las FKs de audit/crm_lead apuntan a client.id, y la fila
--  conservada es la más antigua → la referenciada con mayor probabilidad. Si en una DB real
--  existieran FKs hacia un id duplicado a borrar, el implementer repunta esas FKs al id
--  conservado dentro de esta misma transacción antes del DELETE — ver nota de verificación.)
DELETE FROM client c
USING client keep
WHERE c.cuit IS NOT NULL
  AND keep.cuit = c.cuit
  AND keep.id < c.id;   -- borra todos menos el id menor por CUIT

-- Paso 2: crear el índice único parcial (solo clientes con CUIT; los NULL no chocan).
CREATE UNIQUE INDEX IF NOT EXISTS client_cuit_unique
  ON client (cuit)
  WHERE cuit IS NOT NULL;
```

**Detección previa (R17)** — el implementer corre y deja registrado el resultado antes/después:

```sql
SELECT cuit, count(*) FROM client
WHERE cuit IS NOT NULL
GROUP BY cuit HAVING count(*) > 1;
```

> **Estrategia de conservación (decisión de puerta):** ante CUIT duplicados se **conserva la fila
> de `id` menor (la más antigua)** y se eliminan las demás. Es determinístico y preserva el
> registro original; el upsert en vivo (R10) actualizará luego sus datos con el archivo nuevo.
>
> **Verificación antes de aplicar (T1):** el implementer DEBE correr la query de detección en una
> DB seedeada y confirmar que tras el `DELETE` no quedan duplicados (`HAVING count(*) > 1` vacío) y
> que ninguna FK a `client.id` quedó colgada. Si un `id` a borrar estuviera referenciado por
> `audit`/`crm_lead`, repuntar esas FKs al `id` conservado dentro de la transacción antes del
> `DELETE`.

---

## Endpoint

`src/routes/api/crm/clients/import/+server.ts`:

```ts
export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireAdminApi(locals);
  if (user instanceof Response) return user;           // R2

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return apiError('Falta el archivo', 400);

  const fmt = detectFormat(file.name, file.type);      // R3/R4 (lanza si no soporta)
  const rows = fmt === 'csv'
    ? parseCsv(await file.text())
    : parseXlsx(Buffer.from(await file.arrayBuffer())); // node-xlsx, síncrono

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const plan = planClientImport(rows, headers);        // R5–R9.bis, R16, R5.ter
  const result = await applyClientImport(plan);        // R10–R12, R15
  return apiSuccess(result, 200);                      // R13
};
```

`UnsupportedFormatError` → `apiError('Formato no soportado: usá CSV o .xlsx', 415)` (R4).

---

## UI en CRM

`src/routes/(app)/crm/+page.svelte`:

- Botón **Importar clientes** visible solo cuando `data.user.role === 'admin'`
  (el load ya expone `user`). Abre un panel/modal con `<input type="file" accept=".csv,.xlsx">`.
- Dentro del panel, un **enlace de descarga de plantilla** (`<a href="/plantillas/clientes-import-template.csv" download>`)
  hacia el archivo estático (R19).
- `POST` `multipart/form-data` a `/api/crm/clients/import` vía `fetch` (no form-action, para
  alinear con el patrón JSON de `api/crm/leads/batch`). Render del reporte: contadores
  (leídas/creados/actualizados/omitidos/inválidos) + lista de errores por fila + columnas
  ignoradas (`ignoredColumns`). (R14, R5.ter)

> El `load` del CRM hoy usa `requireStaff` (técnico ve la vista). La **acción** de import es
> admin-only por el guard del endpoint (R2); el botón se oculta para no-admin pero la seguridad
> real vive server-side.

---

## Plantilla de importación descargable (R19/R20/R21)

Archivo estático **`static/plantillas/clientes-import-template.csv`** (SvelteKit sirve `static/`
en la raíz → URL pública `/plantillas/clientes-import-template.csv`). Solo encabezados canónicos
(sin `id`, sin `categoria_iva`, sin timestamps) + filas de ejemplo válidas:

```csv
razon_social,cuit,direccion,cp,provincia,telefono,email
Playadito SACI,30-12345678-9,Ruta 14 Km 5,3318,Corrientes,+54 3758 480000,info@playadito.com.ar
Mazzoni SA,30-87654321-0,Av. San Martín 1200,3500,Chaco,+54 362 4420000,ventas@mazzoni.com.ar
```

- **Formato CSV** (no .xlsx) por simplicidad y por ser editable en cualquier editor/planilla; al
  importarse se trata como cualquier CSV (R3). El CUIT en ejemplo va con guiones para mostrar que
  la normalización (R7) los acepta.
- Encabezados = `CANONICAL_FIELDS` exactos. Un archivo derivado de esta plantilla pasa el import
  sin filas inválidas por encabezado desconocido ni columnas faltantes (R21).
- El test `tests/clients-import-template.test.ts` lee el archivo real de `static/`, verifica
  encabezados canónicos + ≥1 fila ejemplo (R20) y lo corre por `parseCsv`+`planClientImport`
  esperando `invalid: []` (R21).

---

## Archivos a crear / modificar

| Archivo | Acción |
|---|---|
| `src/lib/server/clients/schema.ts` | crear — Zod fila + `normalizeCuit` |
| `src/lib/server/clients/parse.ts` | crear — `parseCsv`, `parseXlsx` (node-xlsx), `detectFormat` |
| `src/lib/server/clients/normalize.ts` | crear — `CANONICAL_FIELDS`, `HEADER_ALIASES`, `normalizeRow`, `inspectHeaders` |
| `src/lib/server/clients/import.ts` | crear — `planClientImport`, tipos `ImportPlan`/`RowError` |
| `src/lib/server/clients/errors.ts` | crear — `UnsupportedFormatError` |
| `src/lib/server/db/clients-import.ts` | crear — `applyClientImport` (transacción, upsert CUIT) |
| `src/routes/api/crm/clients/import/+server.ts` | crear — endpoint admin-only multipart |
| `src/routes/(app)/crm/+page.svelte` | modificar — botón + panel + enlace plantilla + reporte |
| `src/routes/(app)/crm/+page.server.ts` | modificar (si hace falta exponer flag admin) |
| `static/plantillas/clientes-import-template.csv` | crear — plantilla descargable (R19/R20) |
| `migrations/013_client_cuit_index.sql` | crear — limpieza duplicados CUIT + índice único parcial |
| `package.json` / lockfile | modificar — `node-xlsx` |
| `tests/clients-import-parse.test.ts` | crear — R3,R5,R5.bis,R5.ter,R6,R7 |
| `tests/clients-import-validate.test.ts` | crear — R8,R9,R9.bis |
| `tests/clients-import-upsert.test.ts` | crear — R10,R11,R12,R15,R16 |
| `tests/clients-cuit-cleanup.test.ts` | crear — R17,R18 |
| `tests/clients-import-template.test.ts` | crear — R20,R21 |
| `tests/api/clients-import.test.ts` | crear — R2,R4,R13 |
| `e2e/import-clientes.spec.ts` | crear — R1,R14,R19 |

---

## Errores

- Reutiliza envelope `apiError`/`apiSuccess` (`src/lib/server/api/envelope.ts`).
- Nuevo `UnsupportedFormatError extends Error` (`code = 'UNSUPPORTED_FORMAT'`) en
  `src/lib/server/clients/errors.ts`, mapeado a 415 en el endpoint.
- Errores de fila **no** son excepciones: viajan en el reporte (`invalid`/`skipped`) per R8/R9/R13.
- Nunca exponer stack al cliente (per `docs/conventions.md`).

---

## Alternativas descartadas

1. **Form action en `+page.server.ts` en vez de endpoint API.** El CRM ya tiene su mutación de
   lote como endpoint JSON (`api/crm/leads/batch`). Mantener el import como `+server.ts` alinea el
   patrón, facilita tests de API (`tests/api/`) y separa UI de transporte. Descartado el form
   action por consistencia.
2. **Upsert por `id` (como el seed).** El seed deduplica por `id` porque el CSV fuente lo trae;
   el import en vivo **no exige `id`** (decisión de puerta) y la política fija es **por CUIT**.
   Descartado.
3. **`exceljs` / `xlsx` (SheetJS directo) como parser.** Ver §Decisión: Martín fijó `node-xlsx`
   por ser la opción más liviana; `exceljs` es más pesado, `xlsx` directo arrastra avisos de
   vulnerabilidad en el canal npm. Descartados.
4. **Persistir `categoria_iva` (agregar columna a `client`).** El set canónico de la puerta la
   **descarta**: es dato fiscal del CSV de presupuestos, no relevante para el CRM. No se agrega
   columna. Descartado.
5. **Crear una sección `/clientes` nueva.** La puerta humana fijó la ubicación **dentro de CRM**.
   Descartado.
6. **Plantilla en `.xlsx` en vez de CSV.** CSV es editable en cualquier herramienta y se sirve
   como archivo estático sin generación server-side. Descartado por simplicidad.
7. **Dry-run previo (como #20).** Martín no lo pidió en esta ronda; el reporte por fila
   (creados/actualizados/omitidos/inválidos/columnas ignoradas) cubre el acceptance. **No se
   incluye dry-run.** Descartado por alcance.
