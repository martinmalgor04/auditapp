# Requirements — #17 17_contexto_ia

> Fase 2 del motor de informes (#14): enriquecer el prompt de generación con (a) contexto RAG
> de la base vectorial Tango de SyS (Supabase Vector Store, ~16k chunks de webinars Axoft,
> embeddings Gemini, función `match_documents`), (b) catálogo de líneas de servicio SyS con
> rangos por proveedor (HPE/Lenovo/Dell/Sophos) versionado en el repo, y (c) few-shot con
> informes aprobados marcados como ejemplares. Todo el enriquecimiento es opcional por env:
> el pipeline de #14 DEBE seguir funcionando idéntico sin él.
> Fuente: plan lead magnet §7.5 (insumos a la IA); fase 2 declarada en
> `specs/14_informe_ia/requirements.md` y `design.md` (columna «Excluido»).
> Depende de: `14_informe_ia` (#14, `done`) — pipeline, prompt versionado, `audit_report`.

## R1 — Flags de enriquecimiento por env

El sistema DEBE habilitar cada fuente de contexto de forma independiente con
`INFORME_RAG_ENABLED=1`, `INFORME_CATALOGO_ENABLED=1` e `INFORME_FEWSHOT_ENABLED=1`,
tratando ausencia de la variable o cualquier otro valor como deshabilitado.

**Verificación:** `tests/informe-context.test.ts` — `resolveContextConfig` con env vacío
devuelve las tres fuentes off; cada flag activa solo su fuente; valor `'0'`/`'true'` ≠ `'1'`
queda off.

## R2 — Pipeline base intacto sin enriquecimiento

MIENTRAS las tres fuentes están deshabilitadas, el pipeline DEBE generar el informe sin
invocar el retriever RAG, el catálogo ni la selección few-shot, y sin requerir
`GEMINI_API_KEY`, `RAG_TANGO_SUPABASE_URL` ni `RAG_TANGO_SUPABASE_KEY`.

**Verificación:** `tests/informe-pipeline.test.ts` — con flags off y mocks espiados, ninguna
fuente es llamada; el pipeline termina en `borrador` con env mínimo de #14.

## R3 — Recuperación RAG por similitud, no dump

CUANDO `INFORME_RAG_ENABLED=1` y el pipeline arma el prompt, el sistema DEBE construir
consultas a partir de los hallazgos del JSON canónico (circuitos con score más bajo y sus
observaciones) e invocar el retriever (`match_documents` vía RPC) con esas consultas,
inyectando al prompt únicamente los chunks devueltos por similitud sobre el umbral
configurado — NO DEBE inyectar la base completa ni chunks bajo el umbral.

**Verificación:** `tests/informe-rag.test.ts` — `buildRagQueries` deriva consultas de los
circuitos más débiles del fixture canónico; con retriever mock, el bloque RAG del prompt
contiene solo los chunks sobre el umbral y descarta los de similitud menor.

## R4 — Mapeo circuito → módulo Tango

CUANDO se construyen las consultas RAG, el sistema DEBE mapear cada `seccion_code` del
canónico al filtro de módulo de la base vectorial (`ventas`, `compras`, `stock`,
`contabilidad`, `tesoreria`, `capital-humano`, `impositivos`, `generales`, `venta-online`,
`cadenas`) y pasar el filtro al retriever; SI un `seccion_code` no tiene mapeo, ENTONCES la
consulta DEBE ejecutarse sin filtro de módulo.

**Verificación:** `tests/informe-rag.test.ts` — tabla de mapeo cubre los `seccion_code` de
las plantillas ERP seed; código sin mapeo produce consulta con `modulo: null`.

## R5 — Embeddings de consulta vía Gemini

CUANDO el retriever ejecuta una consulta, el sistema DEBE obtener el embedding del texto de
consulta con la API de Gemini (`RAG_GEMINI_EMBEDDING_MODEL`, default `gemini-embedding-001`,
3072 dims — mismo espacio que la base) usando `GEMINI_API_KEY`, y DEBE invocar
`match_documents(query_embedding, match_threshold, match_count)` en el Supabase externo
(`RAG_TANGO_SUPABASE_URL` + `RAG_TANGO_SUPABASE_KEY`) en modo solo lectura.

**Verificación:** `tests/informe-rag.test.ts` — adapter con fetch mock: llama al endpoint de
embeddings con el modelo de env y al RPC `match_documents` con threshold y count
configurados; ninguna llamada de escritura (solo POST al RPC y al endpoint de embeddings).

## R6 — Fallback sin RAG ante fallo o timeout

SI el retriever RAG falla (error de red, credenciales, respuesta inválida) o excede
`INFORME_RAG_TIMEOUT_MS` (default 10000), ENTONCES el pipeline DEBE continuar la generación
sin bloque RAG, registrar el motivo en `context_meta.rag.error` y NO DEBE marcar el informe
en estado `error` por esa causa.

**Verificación:** `tests/informe-pipeline.test.ts` — retriever mock que lanza y mock que
nunca resuelve (timeout fake) producen informe en `borrador` con `context_meta.rag.error`
no vacío y prompt sin bloque RAG.

## R7 — Presupuesto de tokens del contexto RAG

CUANDO se inyecta el bloque RAG, el sistema DEBE limitar su tamaño estimado a
`INFORME_RAG_MAX_TOKENS` (default 6000) usando el estimador de tokens del módulo de
contexto, descartando chunks completos de menor similitud primero hasta cumplir el límite.

**Verificación:** `tests/informe-context.test.ts` — con chunks mock que exceden el límite,
el bloque resultante queda bajo el presupuesto y los descartados son los de menor similitud;
`estimateTokens` aproxima por caracteres de forma determinística.

## R8 — Catálogo SyS versionado en el repo

El sistema DEBE definir el catálogo de líneas de servicio SyS (líneas Tango, infraestructura
HPE/Lenovo/Dell/Sophos, soporte/abonos, SysDesk) como módulo TypeScript versionado en
`src/lib/server/informe/catalogo/` que exporte `CATALOGO_SYS_VERSION` y un array validado
por `catalogoSchema` (Zod strict) con `linea`, `descripcion`, `proveedores`, `rango_usd`
(min/max) y `condiciones`.

**Verificación:** `tests/informe-catalogo.test.ts` — el catálogo embebido pasa
`catalogoSchema`; entrada sin `rango_usd` o con `min > max` es rechazada;
`CATALOGO_SYS_VERSION` es string no vacío.

## R9 — Catálogo inyectado solo a la salida interna, sin producto cerrado

CUANDO `INFORME_CATALOGO_ENABLED=1`, el sistema DEBE inyectar el catálogo al prompt como
insumo exclusivo de las recomendaciones internas (`internal_draft`), instruyendo rangos
orientativos por línea sin nombrar producto cerrado ni precio puntual, y el bloque NO DEBE
referenciarse en las instrucciones de la salida cliente.

**Verificación:** `tests/informe-prompt.test.ts` — con catálogo on, el bloque aparece en la
sección de instrucciones internas del prompt y contiene la regla «sin producto cerrado»; las
instrucciones de salida cliente no referencian el catálogo.

## R10 — Marcar informes aprobados como ejemplares

CUANDO un admin marca un informe como ejemplar vía
`POST /api/audits/[id]/report/[version]/ejemplar` (body `{ ejemplar: boolean }`), el sistema
DEBE persistir `audit_report.ejemplar`; SI el informe no está en estado `aprobado`, ENTONCES
DEBE responder `409`; SI la sesión no es admin, ENTONCES DEBE responder `403` (`401` sin
sesión).

**Verificación:** `tests/api/informe-ejemplar.test.ts` — admin marca/desmarca aprobado
(200, columna actualizada); `borrador` → 409; técnico → 403; sin sesión → 401.

## R11 — Few-shot con informes ejemplares

CUANDO `INFORME_FEWSHOT_ENABLED=1` y existen informes con `ejemplar = true` y
`status = 'aprobado'`, el sistema DEBE inyectar al prompt hasta `INFORME_FEWSHOT_MAX_EXAMPLES`
(default 2) ejemplos — los más recientes por `approved_at` — compuestos por extractos del
`client_draft` aprobado, recortados al presupuesto `INFORME_FEWSHOT_MAX_TOKENS`
(default 4000); SI no existen ejemplares, ENTONCES el pipeline DEBE continuar sin bloque
few-shot y sin error.

**Verificación:** `tests/informe-fewshot.test.ts` — con 3 ejemplares mock entran los 2 más
recientes; extractos recortados al presupuesto; 0 ejemplares → prompt sin bloque y pipeline
verde.

## R12 — prompt_version distingue generaciones enriquecidas

CUANDO el pipeline persiste la fila de `audit_report`, el sistema DEBE guardar
`prompt_version = '2.0'` cuando ninguna fuente aportó contexto, y `'2.0'` más sufijos
deterministas en orden fijo por cada fuente efectivamente inyectada
(`+rag`, `+catalogo`, `+fewshot`; ej. `'2.0+rag+catalogo'`); una fuente habilitada que cayó
a fallback NO DEBE aportar sufijo.

**Verificación:** `tests/informe-prompt.test.ts` — `resolvePromptVersion` cubre las
combinaciones (ninguna, una, todas, rag habilitado pero fallido → sin `+rag`).

## R13 — Trazabilidad del contexto en context_meta

CUANDO el pipeline termina (en `borrador` o `error`), el sistema DEBE persistir en
`audit_report.context_meta` (jsonb, nueva columna) un objeto validado por
`contextMetaSchema` con: flags efectivos, cantidad de chunks RAG usados y descartados,
`catalogo_version`, ids de informes few-shot usados, tokens estimados por fuente y errores
de fallback por fuente.

**Verificación:** `tests/informe-pipeline.test.ts` — generación con todo on persiste
`context_meta` completo y válido; con todo off persiste flags off; `tests/informe-context.test.ts`
— `contextMetaSchema` rechaza meta sin flags.

## R14 — Presupuesto total del prompt

CUANDO se ensambla el prompt final, el sistema DEBE verificar que el total estimado
(canónico + bloques de contexto) no supere `INFORME_PROMPT_MAX_TOKENS` (default 150000);
SI lo supera, ENTONCES DEBE recortar bloques de contexto en orden few-shot → RAG → catálogo
hasta cumplir, y SI aun sin contexto extra lo supera, ENTONCES DEBE marcar el informe en
`error` con mensaje claro.

**Verificación:** `tests/informe-context.test.ts` — presupuesto chico fuerza el orden de
recorte (few-shot cae primero, catálogo último); canónico gigante solo → `error` con mensaje
de presupuesto.

## R15 — Retriever inyectable y testeable con mocks

El sistema DEBE definir el acceso a RAG, catálogo y few-shot detrás de interfaces inyectables
en el pipeline (mismo patrón que el adapter Claude de #14), de modo que todos los tests corran
sin red, sin `GEMINI_API_KEY` y sin Supabase real.

**Verificación:** `tests/informe-pipeline.test.ts` y `tests/informe-rag.test.ts` — suites
verdes con `vi.fn()`/fetch mock; ningún test requiere env de servicios externos.

## R16 — Env documentado

El sistema DEBE documentar en `.env.example` todas las variables nuevas:
`INFORME_RAG_ENABLED`, `INFORME_CATALOGO_ENABLED`, `INFORME_FEWSHOT_ENABLED`,
`RAG_TANGO_SUPABASE_URL`, `RAG_TANGO_SUPABASE_KEY`, `GEMINI_API_KEY`,
`RAG_GEMINI_EMBEDDING_MODEL`, `RAG_MATCH_THRESHOLD`, `RAG_MATCH_COUNT`,
`INFORME_RAG_TIMEOUT_MS`, `INFORME_RAG_MAX_TOKENS`, `INFORME_FEWSHOT_MAX_EXAMPLES`,
`INFORME_FEWSHOT_MAX_TOKENS`, `INFORME_PROMPT_MAX_TOKENS`.

**Verificación:** `tests/informe-context.test.ts` — test que lee `.env.example` y asserta la
presencia de cada clave (mismo patrón que verificaciones de env de #14, si existe; si no,
check de string sobre el archivo).

## Trazabilidad con acceptance de feature_list.json

| Acceptance | Requirements |
|---|---|
| RAG por similitud relevante a hallazgos, no dump | R3, R4, R5, R7 |
| Catálogo versionado en repo → salida interna, sin producto cerrado | R8, R9 |
| Few-shot con aprobados ejemplares | R10, R11 |
| Activable por env, pipeline funciona sin contexto | R1, R2, R6 |
| `prompt_version` distingue generaciones | R12, R13 |
| Tests con mocks: selección, fallback, límites de tokens | R6, R7, R11, R14, R15, R16 |
