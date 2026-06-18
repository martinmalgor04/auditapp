# Requirements — 25_normas_informe

> Exponer en el informe las normas/estándares que respaldan los valores del
> scoring. El dato **ya existe** (`section.standard_ref` viaja hasta el JSON
> canónico #09) pero se corta antes del render del informe (#14/#15).
> No cambia el motor de scoring ni los umbrales.

## Contexto

- Cada sección tiene `standard_ref` en seed (`seed/templates/*.json`) y en el
  schema canónico (`src/lib/server/canonical/schema.ts:42`,
  `standard_ref: z.string().nullable()`).
- IT usa nomenclatura externa publicable: `'CIS N · NIST: fase'`
  (ej. `'CIS 4 · NIST: Protect'`).
- ERP usa nomenclatura **interna** de SyS: `'ERP B1'`, `'ERP E3'`, etc.
  No es un estándar externo publicable hacia el cliente. **Por decisión humana
  (2026-06-17) la norma no se muestra en contexto ERP**, así que este dato nunca
  llega al render del informe ERP.
- La sección de cabecera (`CAB`) tiene `standard_ref = null` en los 3 templates.
- El modelo de render `InformeRenderModel` (`src/lib/informe/render-shared.ts`)
  expone `secciones[]` pero **NO** incluye `standard_ref`.
- Hay **tres** salidas de render que consumen `InformeRenderModel.secciones`:
  - PDF A4 ERP / IT / mixto (`render-erp.ts`, `render-it.ts`,
    `render-mixto.ts` + `render-mixto-parts.ts`).
  - Web pública del informe entregado #15 (`web-render.ts`).
- Snapshots existentes a cuidar:
  `tests/__snapshots__/informe-render.test.ts.snap`,
  `informe-render-it.test.ts.snap`, `informe-web-render.test.ts.snap`,
  `canonical-contract.test.ts.snap`.

## Decisión de presentación de la norma por sección (regla de negocio)

> Reescrita tras la puerta humana (2026-06-17, Decisión 1). La columna "Norma" y
> el bloque de metodología aplican **solo a contexto IT** (auditorías `it` y a las
> secciones/páginas IT de auditorías `mixta`). En **contexto ERP** no se muestra
> norma en absoluto, por lo que **no existe** etiqueta `Control interno` ni mapeo
> de nomenclatura interna ERP: el problema de exponer `ERP B1`/`ERP E3` desaparece
> porque la norma simplemente no se renderiza en ERP.

La norma mostrada en **contexto IT** se deriva así (lectura del canónico, sin
tocar scoring):

- Si la sección IT trae `standard_ref` con formato `'CIS N · NIST: fase'` → se
  muestra tal cual.
- Si una sección IT no trae `standard_ref` (null/vacío) → la celda Norma se
  muestra **vacía** (cadena vacía), sin etiqueta sustituta y sin fallar (R13).
- En **contexto ERP** (auditoría `erp` completa y páginas/secciones ERP de un
  informe `mixto`) **no hay columna Norma**: el render ERP queda exactamente como
  hoy.

Esta regla queda como **R6** y es la única transformación de presentación; ya no
hay helper `normaLabel` ni etiqueta `Control interno`.

## Requirements (EARS estricto)

### Modelo de render

**R1.** El sistema DEBE incluir, por cada entrada de `InformeRenderModel.secciones`,
el campo `standardRef: string | null` proveniente de `section.standard_ref` del
JSON canónico.

**R2.** CUANDO `buildInformeRenderModel` construye `secciones` a partir del
canónico, el sistema DEBE copiar `section.standard_ref` sin alterar su valor
crudo en el modelo (la presentación se resuelve en el render, no en el modelo).

### Norma por sección en la tabla de hallazgos (solo contexto IT)

**R3.** DONDE la auditoría es de tipo `it`, el sistema DEBE mostrar en la tabla
de hallazgos del informe PDF una columna "Norma" con la norma de cada sección IT
relevada.

**R3b.** DONDE la auditoría es de tipo `mixta`, el sistema DEBE mostrar la columna
"Norma" únicamente en las páginas/secciones de hallazgos **IT**; las
páginas/secciones de hallazgos **ERP** del informe mixto NO DEBEN llevar columna
Norma (quedan exactamente como hoy).

**R3c.** DONDE la auditoría es de tipo `erp`, el sistema NO DEBE agregar columna
Norma ni alterar el layout de la tabla de hallazgos: el informe ERP puro DEBE
quedar idéntico al actual (sin cambios de snapshot).

**R4.** DONDE la auditoría incluye contexto IT (tipo `it` o secciones IT de
`mixta`), el sistema DEBE mostrar la norma de cada sección IT relevada en el
listado de hallazgos de la web pública del informe (`web-render.ts`). Las
secciones ERP de la web NO DEBEN mostrar norma.

**R5.** CUANDO una sección de hallazgos IT trae `standard_ref` con formato
`'CIS N · NIST: fase'`, el sistema DEBE mostrar ese texto como norma de la fila.

**R6.** CUANDO se renderiza una sección en contexto **ERP** (auditoría `erp` o
páginas ERP de `mixta`), el sistema NO DEBE mostrar norma alguna para esa fila:
no se expone nomenclatura interna ERP porque no se renderiza columna Norma en
contexto ERP. (No existe etiqueta `Control interno` ni helper de mapeo).

### Bloque de metodología (solo contexto IT)

**R7.** DONDE la auditoría incluye contexto IT (tipo `it` o `mixta`), el sistema
DEBE incluir en el informe PDF un bloque de metodología visible que declare el
marco IT de referencia: CIS Controls v8, NIST Cybersecurity Framework y ciclos de
vida de fabricante (HPE/Lenovo/Dell) para EOL de hardware.

**R8.** DONDE la auditoría incluye contexto IT, el sistema DEBE incluir el mismo
bloque de metodología IT en la web pública del informe (`web-render.ts`).

**R9.** DONDE la auditoría es de tipo `it`, el bloque de metodología DEBE
declarar el marco IT (CIS Controls v8 + NIST CSF + ciclos de vida de fabricante).

**R10.** DONDE la auditoría es de tipo `erp`, el sistema NO DEBE incluir bloque de
metodología alguno: el informe ERP puro DEBE quedar idéntico al actual.

**R11.** DONDE la auditoría es de tipo `mixta`, el bloque de metodología DEBE
declarar únicamente el marco IT (CIS Controls v8 + NIST CSF + ciclos de vida de
fabricante). NO DEBE agregar texto de "control interno ERP" como norma ni
declarar marco ERP.

### No regresión y compatibilidad

**R12.** El sistema NO DEBE modificar el motor de scoring, los umbrales, ni los
valores de score/semáforo de ninguna sección al introducir las normas.

**R13.** El sistema DEBE seguir renderizando informes ya generados (cuyo
`canonicalJson` no incluyera `standard_ref`) sin error: SI una sección **IT** no
trae `standard_ref` ENTONCES el sistema DEBE mostrar la celda Norma **vacía**
(cadena vacía, sin etiqueta sustituta) y NO DEBE fallar.

**R14.** El sistema NO DEBE exponer en ninguna salida del informe la
nomenclatura interna ERP cruda (`ERP B1`, `ERP E3`, etc.). Esto se cumple por
construcción: en contexto ERP no se renderiza columna Norma (R3c, R6), y el
contexto IT solo muestra valores que empiezan con `CIS`.

### Prompt de IA (firme)

> Reescrito tras la puerta humana (2026-06-17, Decisión 3): el prompt SÍ se toca.
> R15 y R16 dejan de ser condicionales.

**R15.** El sistema DEBE modificar el prompt de generación
(`src/lib/server/informe/prompts/generate-report.ts`) para instruir al modelo a
usar el `standard_ref` del canónico al nombrar normas y a NUNCA inventar una
norma; la instrucción aplica al contexto IT/mixta.

**R16.** El sistema DEBE incrementar `INFORME_PROMPT_VERSION` de `2.1` a `2.2`
(`src/lib/server/informe/prompts/generate-report.ts`) al modificar el texto del
prompt (R15).

**R17.** El pipeline de generación DEBE seguir funcionando sin contexto extra
(RAG/catálogo/fewshot desactivados), igual que antes de esta feature.

## Criterios de verificación (resumen R ↔ test)

| R | Verificación concreta |
|---|---|
| R1 | tipo `InformeRenderModel.secciones[n].standardRef` existe; test de tipo/uso |
| R2 | `buildInformeRenderModel` mapea `standard_ref` crudo (fixture con CIS y ERP) |
| R3 | HTML PDF `it` contiene `<th>` "Norma" y celda por fila IT |
| R3b | HTML PDF `mixta`: páginas IT con columna Norma; páginas ERP SIN columna Norma |
| R3c | HTML PDF `erp` NO contiene `<th>` "Norma"; snapshot ERP idéntico al actual |
| R4 | HTML web muestra norma en filas IT; filas ERP sin norma |
| R5 | fila IT muestra `CIS 4 · NIST: Protect` para sección A4 |
| R6 | render ERP/páginas ERP de mixta: ninguna fila muestra norma |
| R7 | HTML PDF `it`/`mixta` contiene el bloque de metodología IT (CIS v8 + NIST + EOL) |
| R8 | HTML web `it`/`mixta` contiene el bloque de metodología IT |
| R9 | bloque `it` declara marco IT |
| R10 | render `erp`: NO existe bloque de metodología; snapshot ERP idéntico |
| R11 | bloque `mixta` declara solo marco IT; sin texto de control interno ERP |
| R12 | snapshots de score/semáforo sin cambios de valor; test de scoring intacto |
| R13 | render IT con canónico sin `standard_ref` no lanza y rinde celda Norma vacía |
| R14 | ninguna salida contiene la subcadena `ERP B` / `ERP E` cruda |
| R15 | test verifica que el prompt instruye "usar standard_ref / no inventar norma" |
| R16 | `INFORME_PROMPT_VERSION === '2.2'` |
| R17 | test de pipeline sin contexto sigue verde |

## Decisiones de la puerta humana (2026-06-17)

El humano pasó la puerta y resolvió las 3 open questions. El spec se actualiza sin
reabrir aprobación (sigue `spec_ready`).

1. **ERP sin columna Norma (Decisión 1).** La columna "Norma" y el bloque de
   metodología aplican **solo** a auditorías `it` y a las secciones/páginas IT de
   `mixta`. El informe **ERP puro queda idéntico al actual**: sin columna Norma,
   sin bloque de metodología, sin cambios de layout ni de snapshot. En `mixta`, las
   páginas/secciones ERP tampoco llevan columna Norma, y el bloque de metodología
   declara **solo** el marco IT (CIS Controls v8 + NIST CSF + ciclos de vida de
   fabricante), sin texto de "control interno ERP". Consecuencia: se **elimina** el
   helper `normaLabel` y la etiqueta `Control interno`; no se expone nomenclatura
   ERP porque directamente no se muestra norma en contexto ERP. Afecta R3, R3b,
   R3c, R4, R6, R7, R10, R11, R13, R14 y la §"Decisión de presentación".
2. **Ubicación del bloque de metodología (Decisión 2).** Franja compacta
   (`.callout`) dentro de la página de Hallazgos (design §5). Confirmado, sin
   página nueva.
3. **Sí se toca el prompt (Decisión 3).** Se modifica `generate-report.ts` para
   instruir al modelo a usar `standard_ref` del canónico y nunca inventar normas
   (contexto IT/mixta), y se sube `INFORME_PROMPT_VERSION` de `2.1` a `2.2`. R15 y
   R16 pasan a ser requisitos firmes (ya no condicionales); R17 se mantiene.
