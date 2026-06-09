# auditapp — Plataforma de auditorías IT/ERP

**ID**: SPEC-07 | **Owner**: Martín Malgor | **Stack**: SvelteKit · postgres.js (SQL puro) · Cloudflare R2 · Docker (Dokploy)

---

## Problem

Servicios y Sistemas hace auditorías IT y ERP usando planillas y procesos manuales: el técnico va al cliente, carga en papel o en un archivo suelto, y después hay que armar el informe a mano. No hay trazabilidad, los datos no están estructurados y la visita dura más de lo necesario porque no hay briefing previo. Sin una plataforma propia no hay forma de escalar ni de alimentar el sistema IA de informes que el pipeline downstream espera.

## Evidence

- Facu y Simón hacen las auditorías sin sistema digital de carga: todo es manual o en planillas.
- El pipeline IA de informes (SPEC-00 §4) ya está diseñado para consumir un JSON canónico de cierre — ese JSON hoy no existe.
- El "formulario Supabase" de la idea original se descartó: SyS necesita control total, no un form de terceros.
- Las plantillas IT y ERP v2 (SPEC-04) están definidas con columnas Registrar/Cómo listas para ser digitalizadas.

## Users

- **Primary — Admin (Martín)**: crea auditorías, asigna técnicos, gestiona plantillas y usuarios, cierra y controla.
- **Primary — Técnico (Facu/Simón)**: carga el relevamiento en campo desde el celular, cierra la sección técnica.
- **Secondary — Cliente**: abre un link sin login y completa datos básicos antes de la visita.
- **Not for**: clientes que quieran ver informes completos, integraciones con ERPs de terceros, uso multi-empresa.

## Hypothesis

Creemos que una app web mobile-first con briefing del cliente + carga data-driven en campo + cierre con índices calculados **digitalizará completamente el flujo de auditorías de SyS**, eliminando la carga manual post-visita. Sabremos que funciona cuando Facu/Simón carguen una auditoría completa desde el celular, el cierre genere el JSON canónico que espera la IA, y el tiempo de preparación del informe baje al menos un 60%.

## Success Metrics

| Métrica | Target | Cómo medir |
|---|---|---|
| Auditorías cargadas 100% en la app | 3 primeras auditorías reales | Revisión manual de los cierres |
| JSON canónico de cierre generado por auditoría | 100% | Validación del schema en el pipeline IA |
| Tiempo de visita con briefing vs. sin | −15 min promedio | Comparación antes/después |
| PWA instalada en celular del técnico | Ambos técnicos | Check manual |

## Scope

**MVP** — App funcional en Dokploy que cubra el flujo completo: admin/técnico crea → cliente completa briefing → técnico carga en campo → **scoring automático determinístico** → cierre con índices + preview del informe → JSON canónico para el pipeline IA (SPEC-08). Las 3 plantillas (IT v2, ERP Tango v2, ERP Estándar v1) cargadas como seed. Admin y técnico crean y ven auditorías. DB no expuesta a internet.

**Out of scope**

- Generación del informe final branded / PDF / Loom (eso es el pipeline SPEC-08; la app hace el **preview**).
- **Portal de calendario / agenda de visitas** desde el backoffice → **v2** (post-agenda dispara el briefing). Arquitectura abierta al cambio.
- Offline-first completo con sync (v2) — v1 tiene autosave con cola de reintentos **+ export/import JSON**.
- **Editor de plantillas**: v1 = solo edición de ítems existentes (no crea secciones).
- **Dashboard de métricas agregadas / estudio de mercado** → v2 (deseado; el modelo ya recopila los datos desde v1).
- Recovery de contraseña por magic-link (v1: admin resetea a mano).
- Pre-llenado WHOIS/DNS del briefing (factible, v2).
- Scoring de inventario con IA generativa (v2; v1 = reglas determinísticas de EOL/edad).
- Thumbnails de fotos en backoffice (descartado).
- i18n / multi-idioma (todo en es-AR).

## Delivery Milestones

<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Modelo de datos y migraciones | Schema Postgres + rúbrica de scoring data-driven; seed de 3 plantillas, admin y 2 técnicos | pending | — |
| 2 | Auth y sesiones | Login user+pass, cookies, roles; técnico crea/ve todo, admin acciones sensibles, token de cliente | pending | — |
| 3 | Backoffice (admin + técnico) | Tablero filtrable, CRUD de auditorías, link de briefing, editor de ítems (solo edición) | pending | — |
| 4 | Briefing externo (cliente) | Form público sin login, autosave, confirmación de envío | pending | — |
| 5 | Form técnico mobile | Render data-driven, autosave + export/import JSON, fotos a R2, cámara desde equipo, score en vivo, PWA | pending | — |
| 6 | Storage R2 y adjuntos | Presigned PUT/GET (aws4fetch), compresión de fotos, limpieza automatizada | pending | — |
| 7 | Cierre + scoring automático | Scoring determinístico, índices IT/ERP, riesgos, quick wins, preview del informe | pending | — |
| 7i | Contrato de datos / pipeline IA | JSON canónico versionado, market_data, puente a SPEC-08 | pending | — |
| 8 | Stack y deploy Dokploy | Dockerfile, migraciones SQL, DB en red interna, HTTPS, PWA, .env documentado | pending | — |

## Open Questions

- [x] ~~Ponderaciones del índice~~ — **✅ bajo=1, medio=2, alto=3, muy_alto=5**
- [x] ~~Índice global para combos~~ — **✅ No existe. IT y ERP son scores independientes. `indice_global` eliminado del schema.**
- [x] ~~Expiración del token de briefing~~ — **✅ Sin expiración por tiempo. Token persistente, se invalida por `audit.status`. `token_expires_at` eliminado del schema.**
- [x] ~~ORM~~ — **✅ postgres.js puro con SQL (sin Drizzle ni Kysely)**
- [x] ~~¿Score manual o automático?~~ — **✅ AUTOMÁTICO y determinístico (rúbrica data-driven + pesos). El técnico no carga scores. Autocálculo es MVP, no v2.**
- [x] ~~¿Técnicos pueden crear auditorías?~~ — **✅ SÍ (de momento). Y ven todas las auditorías + resultados.**
- [x] ~~¿Preview del informe en la app?~~ — **✅ SÍ. El informe final/branded/Loom es del pipeline SPEC-08.**
- [x] ~~¿Dashboard de métricas?~~ — **✅ SÍ, deseado (estudio de mercado). v2; el modelo ya recopila datos.**
- [x] ~~Editor de plantillas v1~~ — **✅ Solo edición de ítems existentes.**
- [x] ~~Offline-first~~ — **✅ NO; en su lugar export/import JSON.**
- [x] ~~Pre-llenado WHOIS/DNS~~ — **✅ Factible; v2.**
- [x] ~~Estándar de scoring~~ — **✅ CIS Controls v8 + NIST CSF + escala de madurez 0/50/100, transversal. EOL por ciclo de vida del fabricante.**
- [x] ~~JSON canónico / pipeline n8n~~ — **✅ Lo define SyS en 07i (el pipeline no existe aún y se adapta al contrato).**
- [x] ~~Dominio~~ — **✅ `app.auditoriaserviciosysistemas.com.ar`.**
- [x] ~~Seed de clientes~~ — **✅ `seed/clientes-presupuestossys.csv` guardado (1.905 filas), se importa en M1d.**
- [x] ~~Rangos de antigüedad fallback~~ — **✅ PC <3/3-5/>5; servidor/red <4/4-6/>6.**
- [x] ~~Campos `market_data`~~ — **✅ Confirmados (07i §3).**
- [x] ~~Migraciones en Dokploy~~ — **✅ En el entrypoint del container.**
- [x] ~~¿SPEC-08 aparte?~~ — **✅ NO; el pipeline es parte de la app (07i), documentado en `sysaudit/`.**
- [x] ~~Modelo de `client`~~ — **✅ Con cabecera completa (columnas fijas).**
- [x] ~~Auth export~~ — **✅ Sesión de admin.** · CI: build+tests pre-push, deploy con push en Dokploy.
- [x] ~~Briefing~~ — **✅ Header con nombre de empresa; formato adaptativo (1 pág / wizard).** · Login: mensaje genérico. · % avance: N/A = completado.
- [ ] Definir el set exacto de ítems `filled_by='cliente'` (se decide al cargar el seed de plantillas).
- [ ] Definir qué secciones del relevamiento ve el cliente vs. quedan internas.
- [ ] Fijar `schema_version = 1.0` al cerrar la primera auditoría real.

## Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Señal en campo peor de lo esperado | Media | Alto | Cola de reintentos + PWA + export/import JSON; offline-first en v2 si es necesario |
| Pesos/rúbrica del scoring cambian post-definición | Alta | Medio | Guardados en DB (section.weight, options de cada ítem), editables sin deploy |
| JSON canónico no coincide con lo que espera la IA | Media | Alto | Contrato versionado en 07i; acordar `schema_version` antes de construir M7 |
| Scoring determinístico difícil de definir para algunos ítems | Media | Medio | Rúbrica explícita por `field_type`; ítems sin rúbrica clara marcados `scores=false` |
| Plantillas con ítems que no mapean a ningún field_type | Baja | Medio | Revisión del mapeo en 07a antes de la migración |
| Postgres expuesto por error a internet | Baja | Alto | DB solo en red Docker interna; sin port mapping al host |

---

*Status: DRAFT — specs detalladas en `specs/`. Milestones listos para `/plan`. Decisiones grandes cerradas (scoring estándar, contrato, dominio, seed). Pendientes menores no bloquean M1–M6.*

**PRDs de cada milestone**: `.claude/prds/auditapp-02-modelo-datos.prd.md` … `auditapp-09-contrato-datos-ia.prd.md`
