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
