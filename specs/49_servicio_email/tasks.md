# Tasks — #49 49_servicio_email

> Orden de implementación. Cada paso referencia los `R<n>` que cubre. No marcar `done` sin
> `./init.sh`, `pnpm run check`, `pnpm run build` y `pnpm test` en verde.

- [x] T1 — Extender `serverEnvSchema` en `src/lib/server/env.ts` con `SMTP_HOST`, `SMTP_USER`,
  `SMTP_PASS`, `SMTP_FROM` (`optionalString`), `SMTP_PORT` (opcional numérico), `SMTP_SECURE`
  (opcional bool). Cubre: R1.
- [x] T2 — Actualizar `.env.example` con bloque `# ── Email (SMTP, #49) ──` y las seis vars con
  placeholders `<...>`, sin secretos. Cubre: R1.
- [x] T3 — Crear migración `migrations/0NN_servicio_email.sql` (0NN = siguiente disponible tras
  025): `email_log` + índices `IF NOT EXISTS` + `ALTER TABLE app_user ADD COLUMN IF NOT EXISTS
  notify_internal_email boolean NOT NULL DEFAULT true`. Idempotente. Cubre: R6, R12.
- [x] T4 — `tests/email-schema.test.ts`: migración 2x sin error; columnas, CHECK de estado y
  `notify_internal_email` presentes. Cubre: R6.
- [x] T5 — Crear `src/lib/server/db/email-log.ts`: `insertEmailLog`, `listEmailLogByTemplate`.
  Cubre: R7.
- [x] T6 — Crear `src/lib/server/email/transport.ts`: transport nodemailer desde `.env`,
  `isDryRun()`, `sendWithRetry` con `EMAIL_MAX_ATTEMPTS` y backoff; transport inyectable para test.
  Cubre: R2, R3, R4.
- [x] T7 — Crear `src/lib/server/email/layout.ts`: layout HTML branded SyS email-safe (inline) +
  versión texto plano. Cubre: R5.
- [x] T8 — Crear `src/lib/server/email/templates.ts`: `EMAIL_TEMPLATES` con las 5 `aviso_*`
  (`aviso_auditoria_asignada`, `aviso_briefing_completado`, `aviso_informe_aprobado`,
  `aviso_auditoria_cerrada`, `aviso_feedback_cliente`; schema Zod + render) y las 3 reservadas
  (`password_reset`, `envio_informe_cliente`, `envio_briefing_cliente`) con schema declarado.
  Cubre: R5.
- [x] T9 — Crear `src/lib/server/email/index.ts`: contrato `sendEmail(template, to, data)` —
  valida data (Zod), normaliza/valida destinatarios, render, dry-run vs envío, registra cada
  intento en `email_log`, nunca lanza, logs sin secretos. Cubre: R1, R2, R3, R5, R7, R14.
- [x] T10 — `tests/email-config.test.ts` (R1), `tests/email-client.test.ts` (R2, R3, R4, R14),
  `tests/email-templates.test.ts` (R5), `tests/email-log.test.ts` (R7). Cubre: R1, R2, R3, R4, R5,
  R7, R14.
- [x] T11 — Crear `src/lib/server/email/notify.ts`: `resolveInternalRecipientUserIds(auditId, evento)`
  (regla R11: admin involucrado = `audit.created_by` si es admin, si no → todos los admins activos;
  + técnicos asignados vía `listAuditAssignments`; devuelve **userIds** únicos para reuso de #53;
  excluye inactivos y opt-out de email); helper que resuelve emails desde userIds; `onAuditoriaAsignada`,
  `onBriefingCompletado`, `onInformeAprobado`, `onAuditoriaCerrada`, `onFeedbackCliente`, cada uno en
  try/catch que loguea y no propaga. Cubre: R8, R9, R10, R11, R12, R13, R16, R17.
- [x] T12 — Enganchar los cinco eventos en call sites existentes:
  `backoffice/audits.ts` (tras `insertAuditAssignments`, técnicos recién asignados →
  `onAuditoriaAsignada`); `briefing/submit.ts` (tras `briefing_completo` →
  `onBriefingCompletado`); servicio/action que aprueba informe (tras `approveReport` →
  `onInformeAprobado`); action de cierre `auditorias/[id]/cierre/+page.server.ts` (tras transición
  `en_cierre → cerrada` → `onAuditoriaCerrada`); capa de dominio de la encuesta
  `informe/survey.ts` (tras `insertSurveyResponse` → `onFeedbackCliente`). Cubre: R8, R9, R10, R13,
  R16, R17.
- [x] T13 — `tests/email-eventos.test.ts`: cada uno de los cinco eventos dispara el aviso correcto a
  los destinatarios por R11; sin reenvío en re-guardar/early-return/re-submit de encuesta; opt-out e
  inactivos excluidos; con transporte que siempre falla la operación de negocio completa igual. Cubre:
  R8, R9, R10, R11, R12, R13, R15, R16, R17.
- [x] T14 — Mapa de trazabilidad `R<n>` ↔ test en `progress/impl_49_servicio_email.md`. Cubre: R15.
- [x] T15 — `./init.sh`, `pnpm run check`, `pnpm run build`, `pnpm test` verdes; sin SMTP externo.
  Cubre: R15.
