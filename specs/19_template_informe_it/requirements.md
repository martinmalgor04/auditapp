# Requirements — #19 19_template_informe_it

> Template A4 propio para auditorías IT puras y mixtas. Hoy #14 renderiza el template ERP
> (`docs/plantillas/informe/template_informe_pdf_a4_v1.html`) para todos los `types`, parametrizando
> solo títulos de portada (`tituloPortada`/`tipoLabel` en `src/lib/informe/render.ts`). Decisión de
> la puerta humana de #14 (2026-06-12, open question 5): las auditorías IT merecen estructura propia
> (áreas de infraestructura/seguridad en vez de circuitos ERP) y el caso mixto debe estar definido.
> Fuente: `specs/14_informe_ia/design.md` (decisión puerta 5) + template ERP base +
> secciones reales del canónico IT (`seed/templates/it-v2.json`: CAB, A1–A14).
> Depende de: #14 `14_informe_ia` (done).

Vocabulario: en este spec «área» refiere a una sección del template IT (A1 Inventario de activos …
A14 Formación y concienciación) y «circuito» a una sección ERP. `tipoAuditoria` es la derivación
existente de `canonical.types` en `src/lib/server/informe/model.ts` (`erp` | `it` | `mixta`).

## R1 — Selección de template por tipo de auditoría

CUANDO se renderiza un informe (vista de revisión, modo edición e impresión), el sistema DEBE
seleccionar la variante de template según `model.tipoAuditoria` derivado de `canonical.types`:
`erp` → template ERP existente, `it` → template IT nuevo, `mixta` → template mixto nuevo. El
despacho DEBE ocurrir dentro de `renderInformeHtml` (módulo puro `src/lib/informe/render.ts` o
módulos hermanos), sin cambios en los consumidores (`report-render.svelte`, inline editor, ruta de
impresión).

**Verificación:** `tests/informe-render.test.ts` — fixture con `types: ['it']` produce el marcador
de la variante IT (`data-template="it"`), `types: ['it','erp-tango']` la variante mixta y
`types: ['erp-tango']` la ERP.

## R2 — El caso ERP no cambia

CUANDO `tipoAuditoria === 'erp'`, el HTML producido por `renderInformeHtml` DEBE ser byte-idéntico
al de #14 para el mismo fixture, salvo el atributo discriminador `data-template="erp"` agregado al
contenedor; los snapshots ERP existentes de `tests/informe-render.test.ts` DEBEN actualizarse solo
por ese atributo y por ningún otro diff.

**Verificación:** `tests/informe-render.test.ts` — snapshot ERP existente: el diff de la corrida de
actualización contiene únicamente `data-template="erp"`; el resto de las aserciones ERP (7 páginas,
gauge, dots, logos R2, `@media print`) pasan sin modificación.

## R3 — Template IT: estructura de páginas propia

CUANDO `tipoAuditoria === 'it'`, el render DEBE producir 7 páginas A4 con esta estructura: (1)
portada dark «Auditoría IT» con cliente, CUIT, período, fecha y áreas relevadas (en lugar de
«Módulos relevados»/«Sistema»); (2) resumen ejecutivo con gauge del índice IT, stat «áreas con
controles aplicados N de T» (placeholder «a editar» si null) y stat «áreas relevadas» con el conteo
de secciones IT puntuadas del snapshot; (3) hallazgos por área: tabla Área / Score / Doc. /
Controles / Madurez sobre las secciones IT del canónico (A1–A14; CAB excluida) + lectura
transversal; (4) riesgos priorizados (cards, igual layout que ERP); (5) recomendación y plan
(timeline + necesitamos/no incluye, igual layout); (6) «Mejoras prioritarias por área»: cards por
área débil con 3 mejoras concretas de infraestructura/seguridad/backups/redes cada una (sin
referencias a funcionalidades Tango) + callout transversal opcional; (7) cierre dark con próximos
pasos y contacto fijo SyS.

**Verificación:** `tests/informe-render.test.ts` — snapshot IT con fixture estable (secciones
A1–A14): contiene las 7 páginas, encabezados «Hallazgos por área» y «Mejoras prioritarias», la
tabla lista títulos de áreas IT, CAB no aparece, y no contiene las cadenas «Tango» (fuera de
módulos vacíos), «módulos» ni «circuito».

## R4 — Branding SyS idéntico al template ERP

El template IT y el mixto DEBEN usar exclusivamente tokens `--sys-*` de
`src/lib/styles/brand.css` para colores, los mismos logos del CDN R2
(`sys_vertical_w.png` en portada/cierre dark, `sys_horizontal_b.png` en footers claros, constantes
`LOGO_VERT_URL`/`LOGO_COLOR_URL` existentes), tipografía Montserrat, formato de página
210×297 mm con borde superior `--sys-azul-electrico` y reglas `@media print` (incl. Loom oculto),
reutilizando el bloque `STYLE` compartido del render ERP.

**Verificación:** `tests/informe-render.test.ts` — snapshots IT y mixto contienen variables
`--sys-*`, ambas URLs de logo R2 y regla `@media print`; no contienen colores hex hardcodeados
nuevos fuera de los ya presentes en el STYLE compartido.

## R5 — Caso mixto: páginas compartidas y duplicadas por dominio

CUANDO `tipoAuditoria === 'mixta'`, el render DEBE producir 9 páginas: compartidas entre dominios
(1) portada «Auditoría IT + ERP», (2) resumen ejecutivo con DOS gauges (índice IT e índice ERP,
cada uno con su semáforo) más las stats, (6) riesgos priorizados unificados en un único ranking,
(7) recomendación y plan unificados y (9) cierre dark; duplicadas por dominio: hallazgos en dos
páginas — (3) «Hallazgos por área (IT)» y (4) «Hallazgos por circuito (ERP)», cada una con su
tabla y su lectura transversal propia — y día a día en una página por dominio: (5) «Mejoras
prioritarias por área» (IT) y (8) «Qué cambia en el día a día» (ERP, funcionalidades Tango).

**Verificación:** `tests/informe-render.test.ts` — snapshot mixto con fixture que combina secciones
IT y ERP: 9 elementos `section.page`, dos gauges con labels «Índice IT» e «Índice ERP», tablas IT y
ERP separadas con solo secciones de su dominio, una sola página de riesgos y una sola de plan.

## R6 — Dominio de cada sección en el modelo de render

CUANDO se construye `InformeRenderModel`, cada entrada de `secciones` DEBE incluir
`domain: 'it' | 'erp'` derivado del template canónico al que pertenece la sección (mapeo
`TEMPLATE_CODE_TO_INDEX` existente en `src/lib/server/scoring/constants.ts`); SI el JSON canónico
del snapshot no permite determinar el dominio de una sección en una auditoría mixta, ENTONCES el
pipeline DEBE marcar el informe en `error` con mensaje claro en vez de renderizar una asignación
ambigua.

**Verificación:** `tests/informe-render.test.ts` + `tests/informe-pipeline.test.ts` — el modelo de
un fixture mixto asigna `domain` correcto a A1–A14 vs circuitos ERP; snapshot canónico mixto sin
metadato de dominio resoluble deja la fila en `error` con `error_message` no vacío.

## R7 — client_draft parametrizado sin romper informes ERP existentes

El sistema DEBE validar el borrador con un schema parametrizado por tipo
(`reportClientDraftSchemaFor(tipo)`): para `erp` DEBE ser exactamente el
`reportClientDraftSchema` actual (informes ERP ya persistidos siguen validando sin migración);
para `it` DEBE reutilizar la misma forma con semántica IT (`hallazgos.circuitos[].seccion_code`
referencia áreas IT; `dia_a_dia` representa mejoras por área, mismo shape
`funcionalidades[{nombre, que_resuelve}]`); para `mixta` DEBE extender los límites de los arrays
compartidos: `hallazgos.lectura_transversal` 3–6, `dia_a_dia.circuitos` 2–6 y `riesgos.items` 3–6,
manteniendo `strict()` en todos los niveles.

**Verificación:** `tests/informe-schemas.test.ts` — drafts ERP válidos de #14 pasan sin cambios con
el schema `erp`; draft mixto con 5 circuitos de día a día pasa con `mixta` y falla con `erp`; claves
extra siguen rechazadas en las tres variantes.

## R8 — Prompt consciente del tipo de auditoría

CUANDO el pipeline arma el prompt, `buildInformePrompt(canonical)` DEBE derivar el tipo de
`canonical.types` e incluir instrucciones específicas: para `it`, redactar hallazgos y mejoras en
términos de infraestructura, seguridad, backups y redes, prohibiendo proponer «funcionalidades
Tango»; para `mixta`, producir lectura transversal y día a día que cubran ambos dominios usando
`seccion_code` de ambos templates y un único ranking de riesgos cross-dominio; el
`INFORME_PROMPT_VERSION` DEBE incrementarse. Las reglas vigentes de #14 (jerga prohibida, líneas y
rangos sin producto cerrado, evidencia del relevamiento) DEBEN mantenerse en las tres variantes.

**Verificación:** `tests/informe-prompt.test.ts` — prompt con canónico IT contiene el bloque IT y no
instruye funcionalidades Tango; prompt ERP queda igual al de #14 (mismas aserciones existentes);
versión de prompt distinta a la anterior; los seis términos de jerga prohibida presentes en las
tres variantes.

## R9 — Labels y campos canónicos correctos por dominio

CUANDO se renderiza la variante IT o la página IT del mixto, los textos fijos del template DEBEN
usar vocabulario IT («área(s)», «infraestructura») y NO DEBEN mostrar «Sistema: Tango Gestión»,
«módulos Tango en uso» ni «Lo que Tango ya sabe hacer»; los scores por área, semáforos y gauges
DEBEN seguir saliendo exclusivamente del snapshot canónico vía `seccion_code` (regla R12 de #14),
nunca del draft, y los bloques canónicos NO DEBEN ser editables en modo edición.

**Verificación:** `tests/informe-render.test.ts` — snapshot IT sin las cadenas prohibidas; en modo
edición (`editMode: true`) los bloques `data-canonical` de la variante IT no exponen
`contenteditable` y los bloques `data-field` sí.

## R10 — Template HTML de referencia documentado

El sistema DEBE versionar el contrato visual del template IT como
`docs/plantillas/informe/template_informe_pdf_a4_it_v1.html` (mismo rol que
`template_informe_pdf_a4_v1.html` para ERP: placeholders `__LOGO_*__`, estructura de páginas,
comentarios sobre campos editables), y el caso mixto DEBE documentarse en ese mismo archivo o en
`design.md` como composición de páginas de ambos templates (no requiere un tercer HTML).

**Verificación:** revisión de la puerta humana — el archivo existe, abre en navegador, imprime a A4
sin desbordes con datos de ejemplo y coincide página a página con R3.

## R11 — Tests de snapshot por variante

El sistema DEBE incluir en `tests/informe-render.test.ts` (o archivo hermano
`tests/informe-render-it.test.ts`) snapshots estables de las variantes IT y mixta con fixtures
deterministas, ejecutables sin credenciales reales; la suite completa `pnpm test` DEBE pasar y los
e2e existentes de #14 NO DEBEN requerir cambios.

**Verificación:** `pnpm test` en verde; `git diff` de `e2e/` vacío; snapshots nuevos commiteados.

## Trazabilidad acceptance → R

| Acceptance (feature_list.json #19) | Requirements |
|---|---|
| Template A4 propio IT, branding SyS coherente (tokens `--sys-*`, logos CDN R2) | R3, R4, R9, R10 |
| Render selecciona ERP/IT/mixto según `canonical.types` sin romper ERP | R1, R2, R6 |
| Schema `client_draft` extendido/parametrizado sin afectar informes ERP generados | R7, R8 |
| Caso mixto definido: páginas compartidas vs duplicadas por dominio | R5, R6 |
| Tests snapshot IT y mixto pasan; snapshots ERP no cambian | R2, R11 |

## Fuera de alcance

- Cambios en pipeline async, máquina de estados, permisos, edición inline y aprobación (#14, sin tocar).
- Migración o regeneración de informes ERP ya persistidos (siguen renderizando con la variante ERP).
- Entrega web del informe (#15) y publicación CDN con token (fase 2).
- Re-cálculo de scoring o pesos de secciones IT (feature #8, vigente).
- Template propio para `erp-estandar` vs `erp-tango` (ambos usan la variante ERP).
