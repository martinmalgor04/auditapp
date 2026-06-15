# Requirements — #21 21_import_clientes

> Acción **dentro de la vista CRM** (`src/routes/(app)/crm`) para que un **admin** cargue
> clientes a la tabla `client` desde un archivo **CSV o Excel (.xlsx)**, en vivo, sin re-seedear.
> El importador parsea el archivo, mapea encabezados al modelo `client`, normaliza vacíos a
> `null` y CUIT a dígitos, valida fila por fila con Zod, hace **match por CUIT** y **upsert**
> (existente se actualiza, nuevo se crea), todo en una transacción, y devuelve un **reporte por
> fila** (leídas, creadas, actualizadas, omitidas, inválidas con motivo).
>
> **Decisiones de puerta humana (Martín, 2026-06-15) — entrada fija, no se rediscuten:**
> - Formato aceptado: **CSV** y **Excel (.xlsx)**.
> - Política de duplicados: **UPSERT por CUIT** (`numero_doc`). Existente se actualiza, nuevo se
>   crea.
> - Ubicación: la acción vive **dentro** de la vista CRM del backoffice
>   (`src/routes/(app)/crm`), **no** en una sección de clientes nueva.
>
> **Decisiones de la 2ª ronda de puerta (Martín, 2026-06-15) — entrada fija:**
> 1. **Índice CUIT — verificar y limpiar antes de crear.** Antes de crear el índice único parcial
>    `migrations/013_client_cuit_index.sql` (UNIQUE solo `WHERE cuit IS NOT NULL`), se detectan y
>    limpian/mergean los CUIT duplicados que ya existan en `client` (procedente del seed #2). Sin
>    limpieza previa, `CREATE UNIQUE INDEX` falla. Estrategia de conservación: ver R17/R18.
> 2. **Filas válidas SIN CUIT → omitidas (`skipped`).** No se crean ni se marcan inválidas; se
>    reportan en una categoría **`omitidos`** separada de **`inválidos`**, con motivo "sin CUIT, no
>    deduplicable". Ver R8.bis/R13.
> 3. **Parser .xlsx: `node-xlsx`** (NO `exceljs`, NO SheetJS `xlsx`). Es la opción más liviana.
>    Default export, `parse(buffer)` → `Array<{ name, data }>` con `data` = array de arrays; la 1ª
>    fila son los encabezados (el wrapper no los detecta solo). Ver R3/design.
> 4. **Set canónico de columnas + plantilla descargable.** El importador **solo** persiste un set
>    canónico de columnas relevantes para el CRM y **descarta el resto** (incluida `categoria_iva`,
>    `id`, `created_at`, `updated_at` y cualquier columna extra). Set canónico final:
>    `razon_social` (obligatoria), `cuit`, `direccion`, `cp`, `provincia`, `telefono`, `email`.
>    Aliasing de encabezados: `cuit` **o** `numero_doc`; `razon_social` **o** `razón social`. El
>    reporte informa cuántas columnas se ignoraron y cuáles. Una **plantilla CSV descargable** con
>    solo los encabezados canónicos y 1-2 filas de ejemplo está disponible desde la UI del CRM.
>    Ver R5/R5.bis/R19/R20/R21. **NO se incluye dry-run** (Martín no lo pidió en esta ronda).
>
> **Diferenciación (no duplicar):** distinto del import de auditorías #20
> (`src/lib/server/bundle/`, bundle JSON portable de una auditoría) y del **seed de arranque**
> #2 (`src/lib/server/db/seed/clients.ts`, lee `seed/clientes-presupuestossys.csv` con upsert por
> `id`). Esta feature es **carga en vivo** desde un archivo subido por el usuario, hace match por
> **CUIT** (no por `id`), y reutiliza libremente el patrón del seed (csv-parse/sync,
> `emptyToNull`).
>
> **Hechos del código respetados (verificados en repo):**
> - Tabla `client` (migraciones 001 + 005): `razon_social text NOT NULL`, `cuit text`,
>   `direccion`, `cp`, `provincia`, `telefono`, `email`, `origen text` con CHECK
>   `IN ('presupuestos','tango','prospecto')`, `created_at`/`updated_at`. **No existe** columna
>   `categoria_iva` y **no se agrega** (queda descartada del set canónico). **No existe**
>   índice/constraint UNIQUE sobre `cuit`: lo crea #21 tras limpiar duplicados del seed (R17/R18).
> - Parser de referencia: `src/lib/server/db/seed/clients.ts` (csv-parse/sync, `columns:true`,
>   `relax_quotes:true`, `emptyToNull`, columna de CUIT del CSV = `numero_doc`).
> - Encabezados del CSV fuente: `id,razon_social,numero_doc,categoria_iva,direccion,cp,provincia,`
>   `telefono,email,created_at,updated_at`. El importador en vivo **NO** exige `id` ni timestamps
>   (los genera el destino).
> - Guards: `requireAdminApi` (`src/lib/server/api/guards.ts`) → 401 sin sesión, 403 si rol ≠
>   admin. CRM hoy carga con `requireStaff` (`+page.server.ts`); esta acción es **solo admin**.
> - Patrón de endpoint: `POST /api/crm/leads/batch` (envelope `{success,data,error}` vía
>   `apiSuccess`/`apiError`, upsert en `sql.begin`, reporte `{inserted,updated}`).

Convenciones EARS (`docs/specs.md`): un solo **DEBE** por requirement, id estable, verificable
por test concreto. Capas, envelope y validación en fronteras per `docs/architecture.md` /
`docs/conventions.md`.

---

## R1 — Acción de import en la vista CRM, solo admin

CUANDO un admin abre la vista CRM (`src/routes/(app)/crm`), el sistema DEBE ofrecer dentro de esa
vista una acción de **Importar clientes** que acepte la subida de un archivo.

## R2 — Solo admin accede a la acción

SI un usuario con rol `tecnico` o `cliente` (o sin sesión) invoca el endpoint de import,
ENTONCES el sistema DEBE rechazar la petición con 403 (401 sin sesión) y NO DEBE leer ni
escribir clientes.

## R3 — Formatos aceptados CSV y Excel (.xlsx)

CUANDO el admin sube un archivo, el sistema DEBE aceptar tanto **CSV** como **Excel `.xlsx`** y
producir, para ambos, la misma estructura de filas normalizadas antes de validar.

## R4 — Formato no soportado rechazado

SI el archivo subido no es CSV ni `.xlsx` (p. ej. `.pdf`, `.xls`, `.json`), ENTONCES el sistema
DEBE rechazar la petición con un error claro y NO DEBE escribir clientes.

## R5 — Set canónico de columnas: solo se persiste lo relevante

CUANDO el sistema parsea el archivo, DEBE detectar la fila de encabezados y mapear **únicamente**
el set canónico de columnas relevantes para el CRM (`razon_social`, `cuit`, `direccion`, `cp`,
`provincia`, `telefono`, `email`) a los campos del modelo `client`, descartando cualquier otra
columna (`id`, `categoria_iva`, `created_at`, `updated_at` y cualquier columna extra) sin
persistirla.

## R5.bis — Aliasing de encabezados

CUANDO el sistema mapea los encabezados, DEBE aceptar como fuente del CUIT tanto `cuit` como
`numero_doc`, y como fuente de la razón social tanto `razon_social` como `razón social`,
resolviéndolos al mismo campo canónico.

## R5.ter — Reporte de columnas ignoradas

CUANDO el sistema descarta columnas no canónicas, DEBE incluir en el reporte cuántas columnas se
ignoraron y los nombres de esas columnas.

## R6 — Normalización de vacíos a null

CUANDO el sistema mapea una fila, DEBE convertir los valores vacíos o solo-espacios de los campos
opcionales a `null` (mismo criterio que `emptyToNull` del seed).

## R7 — Normalización de CUIT a dígitos

CUANDO el sistema mapea el CUIT de una fila, DEBE normalizarlo a **solo dígitos** (eliminar
guiones, puntos y espacios) antes de validar y de hacer match.

## R8 — Validación por fila con Zod: razón social obligatoria

SI una fila no tiene `razon_social` (vacía tras trim), ENTONCES el sistema DEBE marcar esa fila
como **inválida** con su número de fila y motivo, y NO DEBE abortar el procesamiento del resto
del lote.

## R9 — Validación por fila con Zod: formato de CUIT

SI el CUIT normalizado de una fila no tiene un formato válido (no es de 11 dígitos), ENTONCES el
sistema DEBE marcar esa fila como **inválida** con su número de fila y motivo, y NO DEBE abortar
el procesamiento del resto del lote.

## R9.bis — Fila válida sin CUIT se omite (no se crea ni se invalida)

SI una fila pasa la validación de razón social pero **no tiene CUIT** (CUIT normalizado `null`),
ENTONCES el sistema DEBE clasificarla como **omitida** (`skipped`) con motivo "sin CUIT, no
deduplicable", y NO DEBE crearla, actualizarla ni marcarla como inválida.

## R10 — Match por CUIT y upsert

CUANDO una fila válida tiene un CUIT que ya existe en `client`, el sistema DEBE **actualizar** el
cliente existente; CUANDO el CUIT no existe, DEBE **crear** un cliente nuevo. El match se hace
por `cuit` (= `numero_doc`).

## R11 — Origen del cliente creado

CUANDO el sistema crea un cliente nuevo desde el import, DEBE asignarle `origen = 'presupuestos'`
(valor permitido por el CHECK `client_origen_check`), y al actualizar uno existente NO DEBE
sobrescribir su `origen`.

## R12 — Importación transaccional y atómica

CUANDO el sistema aplica las filas válidas, DEBE hacerlo dentro de **una única transacción**; SI
ocurre un error durante la escritura, ENTONCES el sistema DEBE revertir todo y NO DEBE dejar
clientes parcialmente creados o actualizados.

## R13 — Reporte de resultado por categoría

CUANDO el import termina, el sistema DEBE devolver un reporte con **total leído**, **creados**,
**actualizados**, **omitidos** (`skipped`, categoría separada de inválidos) e **inválidos**,
incluyendo para cada fila omitida e inválida su número de fila y motivo.

## R14 — Reporte visible en la UI del CRM

CUANDO el endpoint responde, la vista CRM DEBE mostrar al admin el reporte de resultado (creados,
actualizados, omitidos e inválidos con el detalle de errores por fila).

## R15 — Idempotencia por CUIT

CUANDO el admin reimporta el **mismo archivo**, el sistema DEBE actualizar los clientes ya
existentes (match por CUIT) y NO DEBE crear duplicados.

## R16 — Filas duplicadas dentro del mismo archivo

CUANDO el archivo contiene **dos filas válidas con el mismo CUIT**, el sistema DEBE consolidarlas
en un único cliente (la última gana) y NO DEBE crear dos registros para ese CUIT.

## R17 — Detección de CUIT duplicados antes del índice único

CUANDO la migración del índice único parcial sobre `cuit` se aplica, el sistema DEBE primero
detectar los CUIT duplicados existentes en `client` (`WHERE cuit IS NOT NULL GROUP BY cuit HAVING
count(*) > 1`) antes de crear el índice `client_cuit_unique`.

## R18 — Limpieza/merge de CUIT duplicados conservando una fila

CUANDO existen CUIT duplicados en `client`, el sistema DEBE consolidarlos a un único registro por
CUIT conservando el de **`id` menor** (el más antiguo) y eliminando los demás, de modo que
`CREATE UNIQUE INDEX ... WHERE cuit IS NOT NULL` se aplique sin error.

## R19 — Plantilla de importación descargable

CUANDO el admin abre la acción de Importar clientes en el CRM, el sistema DEBE ofrecer un enlace
para descargar una **plantilla CSV** con los encabezados canónicos y filas de ejemplo.

## R20 — Contenido de la plantilla

La plantilla CSV descargable DEBE contener **exactamente** los encabezados canónicos
`razon_social,cuit,direccion,cp,provincia,telefono,email` y al menos **una** fila de ejemplo
válida.

## R21 — Un archivo generado con la plantilla importa sin filas inválidas

CUANDO el admin importa un archivo construido a partir de la plantilla (encabezados canónicos +
filas de ejemplo válidas), el sistema DEBE procesarlo sin reportar filas inválidas por encabezado
desconocido ni por columnas faltantes del set canónico.

---

## Trazabilidad R ↔ test (la completa el implementer)

| R | Test previsto (vitest/playwright) |
|---|---|
| R1 | `e2e/import-clientes.spec.ts` — acción visible en CRM para admin |
| R2 | `tests/api/clients-import.test.ts` — 401 sin sesión, 403 técnico/cliente |
| R3 | `tests/clients-import-parse.test.ts` — CSV y xlsx → mismas filas (node-xlsx) |
| R4 | `tests/api/clients-import.test.ts` — formato no soportado → error, sin escritura |
| R5 | `tests/clients-import-parse.test.ts` — solo set canónico mapeado; `id`/`categoria_iva`/ts descartados |
| R5.bis | `tests/clients-import-parse.test.ts` — `numero_doc`→cuit; `razón social`→razon_social |
| R5.ter | `tests/clients-import-parse.test.ts` — reporte lista columnas ignoradas y su conteo |
| R6 | `tests/clients-import-parse.test.ts` — vacíos → null |
| R7 | `tests/clients-import-parse.test.ts` — `30-12345678-9` → `30123456789` |
| R8 | `tests/clients-import-validate.test.ts` — fila sin razón social → inválida con fila/motivo |
| R9 | `tests/clients-import-validate.test.ts` — CUIT inválido → inválida con fila/motivo |
| R9.bis | `tests/clients-import-validate.test.ts` — válida sin CUIT → `skipped`, no inválida ni creada |
| R10 | `tests/clients-import-upsert.test.ts` — CUIT existente actualiza, nuevo crea |
| R11 | `tests/clients-import-upsert.test.ts` — nuevo con `origen='presupuestos'`; update no pisa origen |
| R12 | `tests/clients-import-upsert.test.ts` — error a mitad → rollback total |
| R13 | `tests/api/clients-import.test.ts` — reporte con total/creados/actualizados/omitidos/inválidos (categorías separadas) |
| R14 | `e2e/import-clientes.spec.ts` — reporte renderizado en CRM |
| R15 | `tests/clients-import-upsert.test.ts` — reimport mismo archivo → 0 duplicados |
| R16 | `tests/clients-import-upsert.test.ts` — dos filas mismo CUIT → 1 cliente |
| R17 | `tests/clients-cuit-cleanup.test.ts` — detecta CUIT duplicados antes del índice |
| R18 | `tests/clients-cuit-cleanup.test.ts` — merge conserva `id` menor; índice UNIQUE aplica sin error |
| R19 | `e2e/import-clientes.spec.ts` — enlace de descarga de plantilla visible |
| R20 | `tests/clients-import-template.test.ts` — plantilla tiene encabezados canónicos + 1 fila ejemplo |
| R21 | `tests/clients-import-template.test.ts` — importar la plantilla → 0 inválidas por encabezado |
