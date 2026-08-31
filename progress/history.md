# Historial de sesiones

> Bitácora append-only. Cada sesión cerrada añade una entrada al final.

## 2026-06-08 — Migración ECC → harness-sdd

- **Agente:** Cursor (migración de arnés)
- **Resultado:** ECC eliminado. Arnés SDD instalado. 10 features en `feature_list.json`, todas `pending`.
- **Próximo paso:** `/leader` → feature #1 `01_stack_scaffolding` → `spec_author`

## 2026-06-08 — 01_stack_scaffolding (#1) done

- **Agente:** implementer → reviewer
- **Resultado:** Scaffolding SvelteKit 5 + adapter-node, TypeScript strict, Tailwind, Zod, postgres.js stub, vitest (9 tests), Playwright (1 e2e), Postgres 16 Docker dev. `./init.sh`, `pnpm run check`, `pnpm run build`, `pnpm test` verdes.
- **Veredicto:** APPROVED (`progress/review_01_stack_scaffolding.md`)
- **Próximo paso:** `/leader` → feature #2 `02_modelo_datos` → `spec_author`

## 2026-06-08 — 02_modelo_datos (#2) done

- **Agente:** implementer → reviewer
- **Resultado:** Schema Postgres 12 tablas, 12 `field_type`, máquina estados, runner migraciones, Zod field-schemas, seed idempotente (1 admin + 2 técnicos, 3 plantillas, 1895 clientes CSV). 38 tests DB. `./init.sh` verde.
- **Veredicto:** APPROVED (`progress/review_02_modelo_datos.md`)
- **Notas:** Plantillas generadas sin SPEC-04 en repo (fixtures representativos). CSV 1895 registros lógicos.
- **Próximo paso:** `/leader` → feature #3 `03_auth_roles` (spec ya en `spec_ready`, pendiente aprobación humana o implementación)

## 2026-06-09 — 05_briefing_externo (#5) done

- **Agente:** implementer → reviewer (re-review post-fix E2E)
- **Resultado:** Formulario público `/briefing/[token]`: dominio briefing, PATCH autosave, envío a `briefing_completo`, UI mobile-first SyS, wizard condicional. 160 vitest + 2 e2e briefing. Advisory lock vitest/e2e.
- **Veredicto:** APPROVED (`progress/review_05_briefing_externo.md`)
- **Próximo paso:** `/leader` → #7 `07_form_tecnico` (spec_ready, aprobación humana)

## 2026-06-09 — 06_storage_r2 (#6) done

- **Agente:** implementer → reviewer
- **Resultado:** Módulo R2 con `aws4fetch`, presigned PUT/GET, keys, `attachment` + `audit_response`, 3 endpoints API, 15 tests mock. 160 tests vitest. `./init.sh` y `pnpm run check` verdes.
- **Veredicto:** APPROVED (`progress/review_06_storage_r2.md`)
- **Próximo paso:** `/leader` → #7 `07_form_tecnico` (spec_ready, aprobación humana)

## 2026-06-08 — 03_auth_roles (#3) done

- **Agente:** implementer → reviewer
- **Resultado:** Auth argon2id, sesiones cookie HttpOnly/Secure/SameSite=Lax, hooks con renovación sliding, guards admin/técnico, rate limit login (5/60s), validación token briefing por `audit.status`, rutas `/login`, `/logout`, `(app)/`, `/briefing/[token]`. 51 tests nuevos en `tests/auth/` (85 total). `./init.sh`, `pnpm run check`, `pnpm run build` verdes.
- **Veredicto:** APPROVED (`progress/review_03_auth_roles.md`)
- **Próximo paso:** `/leader` → feature #4 `04_backoffice` (spec en `spec_ready`, pendiente aprobación humana)

## 2026-06-09 — 04_backoffice (#4) done

- **Agente:** implementer → reviewer
- **Resultado:** Backoffice bajo `(app)/`: tablero (filtros/búsqueda/orden/paginación 50), CRUD auditorías con congelado de plantillas, briefing link generate/regenerate/copy, ABM usuarios admin, editor plantillas acotado, layout responsive tabla/cards. Migración `002_backoffice.sql` (`archived_at`). 30 tests nuevos (115 vitest total). 2 e2e backoffice verdes. `./init.sh`, `pnpm run check`, `pnpm test`, playwright backoffice OK.
- **Veredicto:** APPROVED (`progress/review_04_backoffice.md`)
- **Próximo paso:** `/leader` → feature #5 `05_briefing_externo` (spec en `spec_ready`, pendiente aprobación humana)

## 2026-06-09 — 07_form_tecnico (#7) done

- **Agente:** implementer → reviewer
- **Resultado:** Form técnico PWA en `/auditorias/{id}/form`: 12 field_types, autosave debounced + cola IndexedDB, export/import JSON, fotos R2 (HEIC→JPEG 1600px), score en vivo, nav libre, transición `en_cierre`, manifest + SW. 34 tests nuevos form/pwa/api (194 vitest total). E2E `form-tecnico.spec.ts` 2/2. `./init.sh` verde.
- **Veredicto:** APPROVED (`progress/review_07_form_tecnico.md`)
- **Próximo paso:** `/leader` → #8 `08_cierre_scoring` (spec_ready, aprobación humana)

## 2026-06-09 — 08_cierre_scoring (#8) done

- **Agente:** leader → implementer → reviewer
- **Resultado:** Motor scoring determinístico (ítem → sección → índice IT/ERP), EOL inventario, persistencia `audit_section_score`/`audit_closure`, pantalla `/auditorias/[id]/cierre` con top riesgos, quick wins, upsell interno, preview HTML, confirmar cierre (invalida token), reapertura admin. `computeLiveScores` integrado al form técnico. 24 tests nuevos (218 vitest total). `./init.sh` verde.
- **Veredicto:** APPROVED (`progress/review_08_cierre_scoring.md`)
- **Próximo paso:** `/leader` → #9 `09_contrato_datos` (spec_ready, aprobación humana) o #11 `11_ui_branding_sys`

## 2026-06-09 — 09_contrato_datos (#9) done

- **Agente:** leader → implementer → reviewer
- **Resultado:** Contrato JSON canónico v1.0: módulo `src/lib/server/canonical/` (builder, schema Zod, market_data, preview compartido), `GET /api/audits/[id]/export` admin-only con header `X-Schema-Version`, cierre integrado vía `buildReportPreview`, ítem `cab_modulos_tango` en seed ERP. 22 tests nuevos (244 vitest total). `./init.sh` verde.
- **Veredicto:** APPROVED (`progress/review_09_contrato_datos.md`)
- **Próximo paso:** `/leader` → #10 `11_ui_branding_sys` (spec_ready, aprobación humana)

## 2026-06-09 — 11_ui_branding_sys (#10) done

- **Agente:** leader → implementer → reviewer
- **Resultado:** Design system SyS global: tokens oficiales (`brand.css` + Tailwind), Montserrat, logos PNG en `static/brand/`, componentes `SysShell`/`SysButton`/`SysInput`/`SysBadge`, shells en login/backoffice/form/cierre/briefing, PWA `#0A1929`. 6 suites `tests/brand-*.test.ts` + `e2e/branding.spec.ts`. 263 vitest total. `./init.sh` verde.
- **Veredicto:** APPROVED (`progress/review_11_ui_branding_sys.md`)
- **Próximo paso:** `/leader` → #11 `10_deploy_dokploy` (spec_ready, aprobación humana)

## 2026-06-09 — 10_deploy_dokploy (#11) done

- **Agente:** leader → implementer → reviewer
- **Resultado:** Deploy Dokploy: Dockerfile multi-stage (node:22-bookworm-slim), entrypoint migrate→node, `/health`, compose ejemplo Traefik, `docs/deploy-dokploy.md`, gate `./scripts/pre-push.sh`, cookies Secure en HTTPS, 9 suites tests deploy + `e2e/pwa-install.spec.ts`. 288 vitest (2 skipped docker). `./init.sh` verde.
- **Veredicto:** APPROVED (`progress/review_10_deploy_dokploy.md`)
- **Próximo paso:** Backlog completo — commit + push cuando el humano lo pida


## 2026-06-23 — 41_referencia_auditoria (#41) done

- **Agente:** implementer → reviewer (CHANGES_REQUESTED R2/R22) → implementer (fixes) → reviewer
- **Resultado:** Referencia legible `ref_code` (`<EMP>-<TIPO>-<NNNN>`) + `empresa.codigo` autogenerado con desambiguación, tipo único al crear, guard anti-duplicado con `confirmDuplicate`, visualización en tablero/detalle/cierre/informe/briefing/psys v1.1. Migraciones `022`–`024`, triggers de inmutabilidad, test de concurrencia. Fixes reviewer: `empresa-codigo-collision.test.ts` (R2), asserts sobre `conflicts[]` en duplicate-guard (R22). `./init.sh` verde — 1107 passed | 2 skipped.
- **Veredicto:** APPROVED (`progress/review_41_referencia_auditoria.md`)
- **Próximo paso:** commit + push cuando el humano lo pida

## 2026-06-23 — 40_offline_snapshot (#40) done

- **Agente:** implementer → reviewer (CHANGES_REQUESTED) → implementer (re-trabajo) → reviewer
- **Resultado:** Snapshot local del form en IndexedDB (`form_draft`, IDB v2): `draft-store.ts`, helpers en `draft-recovery.ts`, banner `DraftRecoveryBanner.svelte`, integración en `+page.svelte`. Draft actualizado en cada guardado, limpieza post-sync, restore/discard con banner al montar. Lógica extraída y testeable; discard contra IDB real (no tautológico). Tests #39 reparados (empresa.codigo NOT NULL). 21 tests nuevos (`draft-store` 8, `draft-recovery` 13). `./init.sh` verde — 1106 passed | 2 skipped.
- **Veredicto:** APPROVED (`progress/review_40_offline_snapshot.md`)
- **Próximo paso:** reviewer #41 `41_referencia_auditoria`

## 2026-06-16 — 24_reunion_extraccion_precisa (#24) done

- **Agente:** leader → spec_author → (puerta humana, 4 decisiones) → implementer → reviewer → implementer (swap fixture)
- **Resultado:** Mejora de precisión del asistente de reunión + migración del análisis OpenAI→Claude. STT sigue en Whisper (intacto); el análisis usa Anthropic Messages API (`fetch` crudo, tool use forzado `propose_values`, sin parseo de texto libre). Tier 1: prompt endurecido (prohíbe inferir de controles vecinos/postura general → omite), contexto enriquecido (`help_text`+`section_title`), guards de grounding (cita=substring real), dedup (mayor confidence) y umbral de confidence. Tier 2: verificador activable por env (default off); error del juez → conserva + marca `verification_status='unverified'` (R19: migración 016 nullable idempotente + badge "No verificada — revisar"). Fixture de regresión con la transcripción real de prueba: ya no se proponen ítems alucinados (capacitación/endurecimiento/reglas firewall/rubro), la cita de contraseñas no se reusa, y backups no queda en "No". Adapter OpenAI `extract.ts` eliminado.
- **Envs nuevas:** `ANTHROPIC_API_KEY`, `REUNION_ANALYSIS_MODEL` (def `claude-sonnet-4-6`), `REUNION_VERIFIER_ENABLED` (def false), `REUNION_VERIFIER_MODEL` (def `claude-haiku-4-5`), `REUNION_CONFIDENCE_MIN` (def 0.5). `OPENAI_API_KEY` se mantiene para Whisper.
- **Verificación:** `pnpm run check` 0 errores en archivos de #24; `pnpm run build` ✓; suite de reunión 94/94 (incl. flujo de revisión #12). `./init.sh` global queda en EXIT 1 por causas ajenas a #24 (3 features in_progress + 17 tests rojos de #23, Fase 1 bloqueada).
- **Veredicto:** APPROVED (`progress/review_24_reunion_extraccion_precisa.md`)
- **Commit:** solo archivos de #24 (el árbol mantiene cambios sin commitear de #23). Decisión humana: commitear #24 pese al rojo global de #23.
- **Próximo paso:** desbloquear #23 Fase 1 (bug SQL real en `dashboard.ts` GROUP BY + replay de migración 013 en `clients-cuit-cleanup.test.ts`); Docker ya está operativo.

## 2026-06-24 — 42_rediseno_ui (#42) done

- **Agente:** leader → implementer (loop) → reviewer (CHANGES_REQUESTED) → implementer fixes → re-reviewer (APPROVED)
- **Resultado:** Rediseño visual integral: tokens CSS/Tailwind (#42), layout shell (HeaderMobile, Sidebar, BottomNav, ProgressBar), tablero cards/tabla + chips, form (FormHeader, SectionChips, QuestionCard, FormNextButton), mercado (StatCard, ErpDistribution, SectionScoreBar, ChipFilters). 32/32 tasks `[x]`. 128 tests UI + e2e specs. Fixes post-review: `brand-shell`, `brand-typography`, aislamiento DB (`setup.ts`, `empresa-estado`, `audit-create-flow`, `clients-cuit-cleanup`). `./init.sh` verde (1231 tests).
- **Veredicto:** APPROVED (`progress/review_42_rediseno_ui.md`, re-review eb89bf48)
- **Próximo paso:** `/leader` → siguiente feature pendiente (#12 `12_reunion_asistente` en `spec_ready`, pausada)

## 2026-06-25 — 12_reunion_asistente (#12) done

- **Agente:** implementer (corrección post-review) → reviewer (APPROVED)
- **Resultado:** Asistente de reunión: grabación/subida de audio (webm/m4a/mp3) vinculado a auditoría editable, almacenamiento R2 (`attachment kind=recording`), transcripción asíncrona con estado visible, extracción IA de propuestas por `item_id` (valor tipado + cita + confidence), UI de revisión humana (aceptar/rechazar/editar) sin auto-aplicar, upsert de `audit_response` con `source=reunion_ia`, consentimiento documentado. T1–T44 en `[x]`.
- **Corrección post-review:** dos bloqueantes del reviewer resueltos sin ampliar alcance: (1) `init.sh` en rojo por 3 tests de `tests/pwa-prod.test.ts` por fuga de `vi.stubGlobal('fetch', ...)` desde `tests/form-autosave.test.ts` bajo `pool: forks` + `singleFork: true` → fix `unstubGlobals: true` en `vite.config.ts`, y `pwa-prod` levanta server estático perezoso e idempotente y se salta sin build de producción; (2) `feature_list.json` actualizado de `spec_ready` (nota "Pausado") a `done`.
- **Verificación:** `pnpm run check` 0 errores (warnings pre-existentes de Svelte); `pnpm run build` OK (adapter-node); `pnpm test` 230 archivos, 1265 pass / 2 skip / 0 fail; `./init.sh` exit 0 "Entorno listo".
- **Veredicto:** APPROVED (`progress/review_12_reunion_asistente.md`)
- **Próximo paso:** `/leader` → siguiente feature del backlog

## 2026-06-25 — 42_rediseno_ui (#42) cierre de sesión

- **Resultado:** Implementación completada y commiteada (`acd8136 feat(#42): rediseño UI integral con shell responsive`). Las 32 tasks de `specs/42_rediseno_ui/tasks.md` en `[x]`. Componentes en `src/lib/components/ui/{ProgressBar,HeaderMobile,Sidebar,BottomNav,StatusBadge,ChipPill,ChipFilters,ItemProgressBar}.svelte`, `backoffice/{AuditCard,TableroHeader}.svelte`, `form/{FormHeader,SectionChips,QuestionCard,FormNextButton}.svelte`, `mercado/{StatCard,ErpDistribution,SectionScoreBar}.svelte`. `feature_list.json` unificado a `done` (entrada `id:42` duplicada en `spec_ready` resuelta).
- **Verificación:** `pnpm run check` 0 errores (41 warnings preexistentes ajenos a la feature); `pnpm run build` OK; `pnpm test` 230 archivos / 1265 tests verdes, 2 skipped (incluye `tests/ui/*`).
- **Veredicto:** APPROVED.
- **Próximo paso:** `/leader` → siguiente feature del backlog.

## 2026-06-25 — 45_inventario_it_informe (#45) done

- **Agente:** implementer → reviewer (APPROVED)
- **Resultado:** Inventario IT en el informe (IT puro y mixto): el JSON canónico (`schema.ts`/`build.ts`) expone las filas de los ítems `field_type=table` de inventario con sus celdas y los attachments por fila (claves R2 de las fotos) sin romper `schema_version`. `InformeRenderModel` incluye el inventario derivado del canónico vía `stripInternalFindings` (jamás material interno). El render IT/mixto muestra sección de inventario con tabla de equipos (tipo, modelo/categoría, antigüedad/año, estado EOL con semáforo del scoring `inventory-eol`) y galería de fotos por equipo (presigned R2 o data-uri, placeholder si falta el attachment); los informes ERP puros no la muestran. Branding SyS (tokens `--sys-*`), reveal-on-scroll y CSS print A4 coherentes. T1–T17 en `[x]`.
- **Verificación:** `pnpm run check` 0 errores; `pnpm run build` OK; `pnpm test` 1285 pass / 2 skip; `./init.sh` verde. Snapshots ERP existentes sin cambios; nuevos snapshots de inventario IT (con y sin fotos) pasan; test de no-filtración de material interno verde.
- **Veredicto:** APPROVED. Trazabilidad en `progress/impl_45_inventario_it_informe.md`.
- **Próximo paso:** `/leader` → siguiente feature del backlog.

## 2026-06-25 — 47_encuesta_conformidad (#47) done

- **Agente:** implementer → reviewer (APPROVED)
- **Resultado:** Encuesta de conformidad propia embebida al final del informe público `/informe/[token]` (#15). Migración idempotente `025_encuesta_conformidad.sql` (tabla `survey_response` + índice único). Dominio: `src/lib/server/db/survey-responses.ts` y `src/lib/server/informe/survey.ts` (Zod + `submitSurveyResponse`). Set fijo: `valoracion_global` 1–5, `claridad_informe` 1–5, `conforme_hallazgos` Sí/No, `comentario` opcional. Una respuesta por share (token), inmutable; reenvío → `already_answered` (409). La respuesta cuelga de `share_id`, congelando «respondés lo que viste». Bloque público `survey-block.svelte` branded SyS, no intrusivo, que nunca expone material interno (load solo entrega `SurveyState`). Resultado visible solo para admin en «Entrega al cliente» (`survey-result.svelte`). T1–T14 en `[x]`.
- **Corrección post-review:** BUG de integridad en `survey.ts` — `conforme_hallazgos` usaba `z.coerce.boolean()` que coacciona el string `'false'` (radio «No») a `true`. Reemplazado por parser explícito de literal `z.union([z.boolean(), z.enum(['true','false'])]).transform(...)`. Cobertura agregada en `tests/encuesta-schema.test.ts` y `tests/api/encuesta-public.test.ts`.
- **Verificación:** `pnpm run check` 0 errores (44 warnings preexistentes ajenos); `pnpm test` 235 archivos, 1306 pass / 2 skip; e2e `e2e/encuesta-conformidad.spec.ts` creado.
- **Veredicto:** APPROVED.
- **Próximo paso:** `/leader` → siguiente feature del backlog.

## 2026-08-10/11 — Adaptación mobile (sesión fuera de flujo SDD)

- **Agente:** Cursor (sesión directa, sin feature del backlog)
- **Resultado:** Loop de captura mobile (Playwright + emulación iPhone 13 / 360px) con `scripts/mobile-audit.mjs` (18+ páginas, reporte de roturas). Única rotura real: tabla del CRM (`/crm`) → fix con patrón cards mobile (`lg:hidden`) + tabla desktop, testid `crm-empresa-card`. Re-captura 0/18 roturas. `pnpm run build` verde; `pnpm run check` con 7 errores PREEXISTENTES en `tests/informe-manual.test.ts`.
- **Notas de entorno:** DB local 5432 no determinística por procesos `vitest` watch zombie de sesiones anteriores (matados 2026-08-11); para el loop se usó Postgres dedicada en 5433. Falla preexistente detectada: e2e `crm-ficha` R21 (`select[name="assignedTechId"]`) reproducible en master.
- **Archivada:** 2026-08-27 por el implementer de #59 al actualizar `progress/current.md` (la sesión quedó sin archivar; el trabajo ya estaba en master).

## 2026-08-27 — 59_escaneo_modelo_datos (#59) done

- **Agente:** spec en chat con puerta humana (decisiones 2026-08-27: consentimiento condicionado, multi-VLAN consolidada, sin purga, sin app aparte) → implementer (cloud) → reviewer (rechazo con 1 blocker → fix → APPROVED).
- **Resultado:** Modelo de datos + repositorio para escaneo automatizado de red. Migración `030_escaneo_modelo_datos.sql` (tablas `escaneo`, `escaneo_dispositivo`, `escaneo_software`, `escaneo_servicio`; `text + CHECK`; FKs a `audit`/`app_user`; índices incl. GIN sobre `raw`; `ip inet`). Módulo `src/lib/server/escaneos/` (schemas Zod con límites defensivos, errores de dominio tipados, repo con 9 funciones y scope `empresaId` vía join con `audit` en cada query, máquina de estados con TRANSICIONES y consentimiento exigido para `en_curso`). Identidad por MAC normalizada con fallback IP; upsert idempotente con COALESCE (R18) y `FOR UPDATE`. T1–T8 en `[x]`.
- **Corrección post-review (B1):** `escaneo_software_uq` → `UNIQUE NULLS NOT DISTINCT` — R20 se violaba con `version IS NULL` (NULLs distintos en Postgres). Verificado empíricamente en PG16 por implementer y reviewer de forma independiente. Test 15° agregado; assertion flaky de `created_at` robustecida (tolerancia 2 s).
- **Verificación:** `tests/escaneos.test.ts` 15/15 ×3 corridas standalone (reviewer, worktree + PG16 aislado); suite completa 1537 pass / 14 failed (las 14 preexistentes en master, verificado con stash); `check` con solo los 7 errores preexistentes; `build` verde. `./init.sh` rojo por causas preexistentes documentadas (feature 07 sin spec commiteable por `.gitignore` con `specs/07*/`; 14 fallas viejas de tests) → candidatas a feature de mantenimiento.
- **Veredicto:** APPROVED (re-review). Trazabilidad 28/28 en `progress/impl_59_escaneo_modelo_datos.md`; review en `progress/review_59_escaneo_modelo_datos.md`. PR #1 mergeado vía fast-forward.
- **Próximo paso:** saga escaneo — #60 (API ingesta) y #61 (agente sys-scan) en spec_author (cloud); después #62–#64. Deuda registrada: feature de mantenimiento para fallas preexistentes (`informe-manual`, `report-html-download`, `audit-crud`, `.gitignore specs/07*`, `console.log` DBG en `db/client.ts`).

## 2026-08-27 — 60_escaneo_ingesta_api (#60) done

- **Agente:** spec_author (cloud, junto con #61) → puerta humana 2026-08-27 (flujo «staff crea, agente opera»; TTL 12 h; rate limits; cron Dokploy) → implementer (cloud) → reviewer (cloud; dos reviewers locales previos murieron por timeouts de infraestructura).
- **Resultado:** API de ingesta de escaneo. Migración `031_escaneo_token.sql` (tabla `escaneo_token`: solo hash SHA-256, TTL 12 h con CHECK, índice parcial único de token activo, FK CASCADE a `escaneo`). Guards `require-escaneo-token` (resuelve `(escaneoId, empresaId)` del token y los pasa al repo de #59; mismatch path↔token → 404), `require-system-token` (env var, `timingSafeEqual`, fail-closed), `require-agente-escaneo` (header `X-Agente-Version` semver, major incompatible → 409). Rate limit en memoria (30/min ingesta, 60/min resto, 10 fallos auth/min por IP). Rutas: staff `POST /api/escaneos` + `POST|DELETE .../token` (admin o `techIsAssigned`); agente `GET` estado, `POST consentimiento`, `POST dispositivos` (chunks 1–100, body ≤2 MB), `POST estado`; sistema `POST /api/system/escaneos-colgados` (compone `escaneosColgados()` + `cambiarEstadoEscaneo` de #59). Documentado en `docs/deploy-dokploy.md` + `.env.example`. T1–T13 en `[x]`.
- **Verificación:** 29/29 tests nuevos (`tests/api/escaneos-*.test.ts` ×4) corridos por implementer y reviewer; suite 1566 pass / 14 failed = baseline exacta de master (1537+29), cero fallas nuevas; `check` con solo los 7 errores preexistentes; `build` verde; migración 031 idempotente verificada. Reviewer corrió gates en VM limpia propia.
- **Veredicto:** APPROVED, cero blockers. Trazabilidad 30/30 en `progress/impl_60_escaneo_ingesta_api.md`; review en `progress/review_60_escaneo_ingesta_api.md`. Observaciones menores (no bloquean): límite 2 MB apoyado en `Content-Length` (endurecer midiendo body real en futura feature), rate limit por token pre-auth con purga por ventana, expiración con reloj del app server.
- **Próximo paso:** #61 agente sys-scan (spec aprobado; requiere repo aparte `sys-scan-agent`); después #62–#64. Deuda de mantenimiento ya registrada en cierre de #59.

## 2026-08-31 — 62_escaneo_revision_ui (#62) done

- **Agente:** spec_author (cloud) → puerta humana 2026-08-30 (OQ1: fusión = solo vínculo; OQ2-B: revisión post-cierre permitida — solo crear escaneo/token queda bloqueado con auditoría cerrada, R32; OQ3: consolidado con todos los escaneos que tengan dispositivos) → implementer (cloud) → reviewer (cloud).
- **Resultado:** UI de revisión de escaneos. Read-model consolidado multi-VLAN en `src/lib/server/escaneos/consolidado.ts` (query con dedup por `identidad`, precedencia `visto_at DESC NULLS LAST` + COALESCE por campo, `tipo` salta `desconocido`, provenance con estado de escaneo, `empresaId` en la misma query). Revisión por identidad (grupo), no por ocurrencia: un escaneo nuevo no revierte la decisión humana. Migración `032_escaneo_revision_vinculo.sql` (vínculo a relevamiento manual por `(item_id, row_id)` con CHECK de paridad; `audit_response` jamás se escribe; vínculo roto resuelto en lectura). Páginas `/auditorias/[id]/escaneos` + detalle deep-linkable por identidad; gestión de escaneos y tokens desde la UI (claro una sola vez). Cards mobile / tabla desktop, form actions server-side, acceso admin o `techIsAssigned`. T1–T16 en `[x]`.
- **Verificación:** 33/33 tests nuevos + e2e 1/1, corridos por implementer y reviewer; suite 1599 pass / 14 failed = baseline exacta de master (1566+33), cero fallas nuevas; `check` con solo los 7 errores preexistentes; `build` verde; migración 032 idempotente.
- **Veredicto:** APPROVED, cero blockers. Trazabilidad 32/32 en `progress/impl_62_escaneo_revision_ui.md`; review en `progress/review_62_escaneo_revision_ui.md`. Desviaciones aceptadas: `fail-from-error.ts` (necesario para R29 con los errores planos de #59), FK SET NULL vs CHECK de paridad (verificado empíricamente, inalcanzable en la práctica), 404/403 por scope de tipo (fail-closed).
- **Próximo paso:** #61 agente sys-scan (spec aprobado; bloqueada hasta crear el repo `sys-scan-agent` en GitHub); después #63 (scoring — ojo: debe recomputar ante revisiones post-cierre, decisión OQ2-B) y #64 (diff). Deuda de saneamiento registrada (baseline roja preexistente: 14 fallas + 7 errores de check + `.gitignore specs/07*` + `console.log` DBG).
