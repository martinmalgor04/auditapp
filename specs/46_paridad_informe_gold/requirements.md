# Requirements — 46_paridad_informe_gold

> Elevar el render web del informe (`web-render.ts`) al nivel del informe que SyS
> arma a mano (gold standard: `2026-informe-grupo_agros_formosa-auditoria-erp-it.html`),
> cerrando las brechas NO cubiertas por #45 (inventario IT con fotos).
>
> **Excluido de esta spec:** sección 06 "Propuesta de abono" (spec futura separada).
> **Coordinación con #45:** la tabla de inventario de equipos NO es parte de #46;
> acá solo la tabla de seguridad / control de usuarios.
>
> Notación: EARS estricto (`docs/specs.md`). Un solo DEBE por requirement.

---

## Brecha 1 — Tabla de control de usuarios y seguridad (en Hallazgos)

- **R1** — DONDE la auditoría incluye una sección de seguridad / control de usuarios
  relevada, el sistema DEBE renderizar dentro de la sección Hallazgos una tabla con
  columnas `control`, `estado` y `observaciones`, con estilo `equip-table` branded SyS.
- **R2** — CUANDO la auditoría NO incluye una sección de seguridad / control de usuarios
  relevada, el sistema DEBE omitir por completo la tabla de seguridad sin dejar
  encabezado, contenedor ni espacio vacío.
- **R3** — El sistema DEBE poblar cada fila de la tabla de seguridad únicamente con
  datos provenientes del canónico / `client_draft` (control, estado, observaciones),
  sin material interno ni `upsell_findings`.
- **R4** — MIENTRAS se renderiza la tabla de seguridad, el sistema DEBE escapar todo
  texto dinámico de cada celda con `escapeHtml`.

## Brecha 2 — Sección "Próximos pasos" con pasos numerados + excl-grid

- **R5** — El sistema DEBE renderizar la sección "Próximos pasos" con sus pasos en
  formato numerado (clases `steps` / `step` / `sn`), un paso por entrada de
  `draft.proximos_pasos`.
- **R6** — El sistema DEBE renderizar, junto a los pasos numerados, un bloque
  `excl-grid` con dos cajas `excl-box`: "Qué necesitamos del cliente"
  (desde `draft.plan.necesitamos_cliente`) y "Qué no incluye esta etapa"
  (desde `draft.plan.no_incluye`).
- **R7** — CUANDO `draft.proximos_pasos` está vacío, el sistema DEBE omitir el bloque
  de pasos numerados sin dejar encabezado ni contenedor vacío.
- **R8** — El sistema NO DEBE renderizar el bloque `twocol` previo de
  necesitamos/no_incluye una vez que el bloque `excl-grid` lo reemplaza, para evitar
  duplicación del mismo contenido.

## Brecha 3 — Timeline vertical con semanas

- **R9** — DONDE el plan tiene más etapas que el umbral de orientación horizontal,
  el sistema DEBE renderizar el timeline en formato vertical (clases `tl` / `tl-item`)
  con la semana, el título y la descripción de cada etapa.
- **R10** — MIENTRAS el plan tiene una cantidad de etapas dentro del umbral horizontal,
  el sistema DEBE conservar el render horizontal existente (`tl-h`) sin cambios visibles.
- **R11** — El sistema DEBE derivar cada ítem del timeline (horizontal o vertical)
  exclusivamente de `draft.plan.etapas`, escapando `semana`, `titulo` y `descripcion`.

## Brecha 4 — `@media print` A4 robusto

- **R12** — MIENTRAS el documento se imprime (`@media print`), el sistema DEBE aplicar
  `@page { size: A4 portrait }` y forzar salto de página por cada sección principal
  del informe (hero + secciones 01–05 y bloques nuevos).
- **R13** — MIENTRAS el documento se imprime, el sistema DEBE renderizar el gauge en su
  valor final estático (arco completo, sin depender de animación JS por
  `stroke-dashoffset` dinámico).
- **R14** — MIENTRAS el documento se imprime, el sistema DEBE renderizar las barras de
  score y los contadores numéricos en su valor final estático (sin animación de
  `width` ni `data-count` a cero).
- **R15** — MIENTRAS el documento se imprime, el sistema DEBE aplicar tema claro legible
  (fondo blanco, texto oscuro) en todas las secciones excepto el hero, manteniendo
  tokens `--sys-*` para los acentos.
- **R16** — SI una sección, tabla, tarjeta o ítem de timeline quedaría cortado entre dos
  páginas ENTONCES el sistema DEBE evitar el corte interno
  (`break-inside: avoid` / `page-break-inside: avoid`).

## Transversales (branding, parametrización, no-regresión)

- **R17** — El sistema DEBE generar todo el contenido nuevo (tabla seguridad, próximos
  pasos, excl-grid, timeline vertical, estilos print) usando tokens `--sys-*`, sin
  colores hardcodeados fuera de la paleta SyS.
- **R18** — El sistema NO DEBE exponer en el render ningún `upsell_finding`, observación
  interna ni dato fuera de `InformeRenderModel` / `client_draft`.
- **R19** — El sistema DEBE mantener inalterados los snapshots existentes de informe
  ERP/IT salvo los cambios intencionales de esta feature.
