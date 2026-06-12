# Design — #19 19_template_informe_it

## Alcance

Variante de template A4 para auditorías IT puras y composición mixta IT+ERP, montada sobre la
infraestructura de #14 sin tocar pipeline, estados, permisos ni edición inline. Tres frentes:

1. **Render** (`src/lib/informe/`): despacho por `tipoAuditoria`, página de hallazgos por área IT,
   página de mejoras IT, resumen con doble gauge en mixto.
2. **Schemas/prompt** (`src/lib/server/informe/`): schema de draft parametrizado por tipo y prompt
   consciente del dominio.
3. **Canónico** (`src/lib/server/canonical/`): metadato de dominio por sección para poder partir
   las tablas del mixto (bump menor `1.0 → 1.1`, campo opcional).

## Contexto: qué hay hoy

- `src/lib/informe/render.ts` — módulo puro; `renderInformeHtml(model, opts)` arma las 7 páginas
  ERP. Ya parametriza portada con `tituloPortada`/`tipoLabel` según `model.tipoAuditoria`, pero las
  páginas 2, 3 y 6 tienen copy ERP fijo («módulos Tango en uso», «Lo que Tango ya sabe hacer…»,
  gauge `indices.erp ?? indices.it`).
- `src/lib/server/informe/model.ts` — `buildInformeRenderModel` deriva `tipoAuditoria` de
  `canonical.types` y aplana `canonical.sections` sin dominio.
- `src/lib/server/informe/schemas.ts` — `reportClientDraftSchema` único, strict.
- `src/lib/server/informe/prompts/generate-report.ts` — `SYSTEM_PROMPT` único con sesgo Tango.
- Canónico IT real (`seed/templates/it-v2.json`): CAB + A1 Inventario de activos, A2 Software /
  licencias, A3 Gestión de datos, A4 Configuración segura, A5 Control de acceso, A6 Protección de
  cuentas, A7 Gestión de vulnerabilidades, A8 Registro y monitoreo, A9 Protección contra malware,
  A10 Recuperación de datos / backups, A11 Seguridad de red, A12 Seguridad perimetral, A13
  Seguridad wireless, A14 Formación y concienciación.

## Arquitectura del render

```
src/lib/informe/
├── render.ts           # renderInformeHtml = despachador por tipoAuditoria (R1)
├── render-shared.ts    # STYLE, escapeHtml, field(), footer(), gauge, helpers extraídos
├── render-erp.ts       # páginas ERP actuales, movidas SIN cambios de output (R2)
├── render-it.ts        # páginas IT (R3)
└── render-mixto.ts     # composición mixta (R5): reusa páginas de erp/it + propias
```

`renderInformeHtml` queda como única API pública (los consumidores —
`report-render.svelte`, inline editor, ruta imprimir, snapshot tests — no cambian):

```ts
export function renderInformeHtml(model: InformeRenderModel, opts: RenderOptions = {}): string {
  switch (model.tipoAuditoria) {
    case 'it':    return renderInformeIt(model, opts);
    case 'mixta': return renderInformeMixto(model, opts);
    default:      return renderInformeErp(model, opts);
  }
}
```

El contenedor pasa de `<div class="informe-a4">` a
`<div class="informe-a4" data-template="erp|it|mixta">` — único diff permitido en el snapshot ERP
(R2). La extracción a `render-shared.ts` debe ser move-only: mismo STYLE string, mismas firmas.

### Modelo de render (model.ts)

```ts
secciones: Array<{
  code: string;
  title: string;
  score: number | null;
  semaforo: RenderSemaphore | null;
  domain: 'it' | 'erp';          // NUEVO (R6)
}>;
```

Derivación de `domain`: el canónico 1.1 agrega `template_code` opcional por sección (ver abajo) y
`buildInformeRenderModel` lo mapea con `TEMPLATE_CODE_TO_INDEX`. Fallback para snapshots 1.0 ya
persistidos: si `canonical.types` resuelve a un solo dominio, todas las secciones heredan ese
dominio (cubre todo informe ERP o IT puro existente); si es mixto y falta `template_code`, se lanza
`InformeDomainUnresolvedError` y el pipeline marca `error` (R6) — no hay heurística por prefijo de
código para no adivinar.

### Canónico 1.1 (`src/lib/server/canonical/`)

- `canonicalSectionSchema`: `template_code: z.string().min(1).optional()`.
- `build.ts`: poblar `template_code` desde la relación sección→template que ya existe en DB.
- `CANONICAL_SCHEMA_VERSION = '1.1'`. El check del pipeline de #14 (R5 de #14) compara igualdad
  exacta contra la constante, así que generar informes nuevos sigue funcionando; los snapshots
  viejos `1.0` solo se re-renderizan (no re-validan schema_version) y caen en el fallback anterior.
- `stripInternalFindings` no cambia (campo público).

### Página por página — template IT (R3)

| # | Página | Base | Diferencias vs ERP |
|---|---|---|---|
| 1 | Portada dark | ERP | Título «Auditoría IT» (ya existe). Meta: «Áreas relevadas: N» + fecha; sin «Sistema: …» ni lista de módulos Tango. |
| 2 | Resumen ejecutivo | ERP | Gauge usa `indices.it` («Índice IT general»). Stat 2: «áreas con controles internos aplicados» (mismo campo `resumen.circuitos_con_controles`, label IT). Stat 3: conteo de secciones IT puntuadas («áreas relevadas») en lugar de módulos. |
| 3 | Hallazgos por área | ERP (tabla) | Eyebrow «02 · Hallazgos por área», th «Área». Filas: secciones `domain === 'it'`, CAB excluida (sin score → ya filtrable por `score !== null` + code ≠ CAB). Lectura transversal igual. |
| 4 | Riesgos priorizados | ERP | Sin cambios de layout. |
| 5 | Recomendación y plan | ERP | Sin cambios de layout. |
| 6 | Mejoras prioritarias | nueva | Eyebrow «05 · Mejoras prioritarias», h2 «Lo que tu infraestructura necesita y hoy no tiene». Cards `.circuito` por área débil con 3 mejoras (`dia_a_dia.circuitos[].funcionalidades` con semántica mejora/qué resuelve) + «hoy N/100» del snapshot + callout opcional. |
| 7 | Cierre dark | ERP | Sin cambios. |

Los `data-field` paths no cambian (mismo shape de draft), así que el inline editor de #14 funciona
sin tocar `inline-edit.ts`.

### Composición mixta (R5) — 9 páginas

| # | Página | Origen | Compartida/duplicada |
|---|---|---|---|
| 1 | Portada «Auditoría IT + ERP» | shared | compartida |
| 2 | Resumen ejecutivo doble gauge | nueva (`render-mixto`) | compartida |
| 3 | Hallazgos por área (IT) | render-it pág. 3 | duplicada por dominio |
| 4 | Hallazgos por circuito (ERP) | render-erp pág. 3 | duplicada por dominio |
| 5 | Mejoras prioritarias (IT) | render-it pág. 6 | duplicada por dominio |
| 6 | Riesgos priorizados (ranking único cross-dominio) | shared | compartida |
| 7 | Recomendación y plan | shared | compartida |
| 8 | Qué cambia en el día a día (ERP) | render-erp pág. 6 | duplicada por dominio |
| 9 | Cierre dark | shared | compartida |

Particiones de datos en mixto:
- Tabla de hallazgos: `d.hallazgos.circuitos` filtrado por `domain` del `seccion_code` resuelto
  contra `model.secciones` (las filas IT van a pág. 3, ERP a pág. 4).
- Lectura transversal: las observaciones son cross-dominio; van completas en la página IT (pág. 3)
  y la página ERP omite el bloque (decisión simple, evita duplicar texto; ver open question 2).
- `dia_a_dia.circuitos`: split por dominio igual que hallazgos (pág. 5 IT / pág. 8 ERP).
- Doble gauge: dos `.stat` con gauges `indices.it` e `indices.erp`; stat 3 única con módulos Tango
  (lado ERP aporta esa data). El stat «circuitos con controles» mantiene label ERP+IT neutro:
  «circuitos/áreas con controles aplicados».
- Numeración de footers: 02–08 corridos; eyebrows renumerados 01–07.

### Schemas (R7) — `src/lib/server/informe/schemas.ts`

```ts
export type TipoAuditoria = 'erp' | 'it' | 'mixta';

export function reportClientDraftSchemaFor(tipo: TipoAuditoria) {
  if (tipo !== 'mixta') return reportClientDraftSchema; // ERP e IT: shape idéntico
  return reportClientDraftSchema.extend({...});          // mixto: límites ampliados
}
```

- `erp` e `it` comparten `reportClientDraftSchema` actual sin cambios (los campos son
  semánticamente neutros: `seccion_code`, `funcionalidades[{nombre, que_resuelve}]`).
- `mixta`: `lectura_transversal` 3–6, `riesgos.items` 3–6, `dia_a_dia.circuitos` 2–6. Resto igual,
  `strict()` en todos los niveles.
- `pipeline.ts` y el PATCH de revisión (`[version]/+server.ts`) pasan el tipo derivado del snapshot
  canónico de la fila a `reportClientDraftSchemaFor` en vez de importar el schema fijo. Los
  informes ERP persistidos siguen validando idéntico (rama `tipo !== 'mixta'` devuelve el mismo
  objeto schema, misma referencia).

### Prompt (R8) — `prompts/generate-report.ts`

- `buildInformePrompt(canonical)` deriva tipo con el mismo helper `tipoAuditoria` (mover de
  `model.ts` a un módulo compartible `src/lib/server/informe/tipo.ts` para no duplicar).
- `SYSTEM_PROMPT` se arma por concatenación: bloque base (rol, jerga prohibida, líneas/rangos,
  evidencia) + bloque por tipo:
  - `erp`: bloque actual sin cambios de texto (las aserciones de `informe-prompt.test.ts` quedan).
  - `it`: «hallazgos y mejoras en términos de inventario, licencias, control de acceso, backups,
    seguridad de red/perimetral/wireless y formación; “dia_a_dia” = 3 mejoras concretas por área
    débil; PROHIBIDO proponer funcionalidades Tango».
  - `mixta`: instrucciones IT + ERP, lectura transversal y riesgos cross-dominio en un ranking
    único, `seccion_code` de ambos templates, respetar los límites ampliados.
- `INFORME_PROMPT_VERSION`: bump (p. ej. `2026-06-12.1` → siguiente).

### Errores nuevos (`errors.ts`)

```ts
export class InformeDomainUnresolvedError extends Error {} // R6: mixto sin template_code
```

El pipeline la captura como cualquier fallo → fila en `error` con mensaje.

## Template HTML de referencia (R10)

`docs/plantillas/informe/template_informe_pdf_a4_it_v1.html` — **borrador**, mismo rol contractual
que `template_informe_pdf_a4_v1.html`: 7 páginas de la tabla IT de arriba, placeholders
`__LOGO_VERT__`/`__LOGO_COLOR__`, datos de ejemplo de una auditoría IT (áreas A1–A14, índice IT),
comentarios `<!-- ✏️ -->` en campos editables. Se crea en T1 copiando el ERP y reemplazando
páginas 1, 2, 3 y 6 según este design; la puerta humana lo valida visualmente antes de codificar
`render-it.ts`. El mixto no lleva HTML propio: queda definido por la tabla de composición (las
páginas son las de los dos templates).

## Archivos a crear/modificar

### Crear
- `docs/plantillas/informe/template_informe_pdf_a4_it_v1.html` (borrador de referencia, R10)
- `src/lib/informe/render-shared.ts`, `render-erp.ts`, `render-it.ts`, `render-mixto.ts`
- `src/lib/server/informe/tipo.ts` (helper `tipoAuditoria` compartido)
- `tests/informe-render-it.test.ts` (snapshots IT y mixto + aserciones R3/R5/R9)

### Modificar
- `src/lib/informe/render.ts` → despachador + re-exports (API pública intacta)
- `src/lib/server/informe/model.ts` → `domain` en secciones, usa `tipo.ts`
- `src/lib/server/informe/schemas.ts` → `reportClientDraftSchemaFor`
- `src/lib/server/informe/prompts/generate-report.ts` → prompt por tipo, bump versión
- `src/lib/server/informe/pipeline.ts` + `src/routes/api/.../report/[version]/+server.ts` →
  schema por tipo en validación de draft y PATCH
- `src/lib/server/informe/errors.ts` → `InformeDomainUnresolvedError`
- `src/lib/server/canonical/schema.ts` + `build.ts` → `template_code` opcional, versión `1.1`
- `tests/informe-render.test.ts` (solo atributo `data-template="erp"`), `tests/informe-schemas.test.ts`,
  `tests/informe-prompt.test.ts`, fixtures canónicos de test (agregar `template_code`)

## Alternativas descartadas

1. **Un solo template con `if` por sección dentro de `renderInformeHtml`** — el ERP quedaría
   sembrado de condicionales y cualquier ajuste IT arriesga el snapshot ERP (acceptance exige que
   no cambie). El despachador aísla cada variante; el costo es algo de duplicación de markup,
   mitigada por `render-shared.ts`.
2. **Schema de draft distinto para IT (`reportItDraftSchema` con claves `areas`/`mejoras`)** — más
   expresivo, pero rompe el mapeo 1:1 `data-field` → draft del inline editor de #14, obliga a
   ramificar `inline-edit.ts`, el PATCH y el historial de ediciones, y complica el caso mixto (dos
   shapes en un draft). Se mantiene el shape único con semántica por dominio.
3. **Inferir dominio por prefijo de código de sección (`A\d+` → IT)** — frágil: los códigos los
   define cada template versionado y nada impide colisiones futuras. Se prefiere `template_code`
   explícito en el canónico (1.1) + error tipado cuando falta en mixto.
4. **Tercer HTML de referencia para el mixto** — duplicaría 9 páginas que son composición exacta de
   los otros dos contratos; la tabla de composición del design es el contrato.

## Open questions (para la puerta humana)

1. **Stat 3 del resumen IT**: propuesto «áreas relevadas N». Alternativa: cantidad de equipos
   inventariados (dato más vendedor pero no siempre presente en el canónico). ¿OK «áreas relevadas»?
2. **Lectura transversal en mixto**: propuesta en la página IT (pág. 3) únicamente. ¿Preferís
   repetirla en la ERP o partirla por dominio (requeriría campo nuevo en el draft)?
3. **Bump canónico 1.0 → 1.1**: informes nuevos sobre auditorías ya cerradas regeneran snapshot
   1.1 al crear versión nueva (el builder corre en cada generación), así que el fallback 1.0 solo
   aplica a re-render de informes viejos. ¿Confirmás que no hace falta migrar snapshots persistidos?
4. **Título página 6 IT** («Lo que tu infraestructura necesita y hoy no tiene»): validar copy con
   voz SyS antes de fijarlo en el HTML de referencia.
