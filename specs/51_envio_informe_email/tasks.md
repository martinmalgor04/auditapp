# Tasks — #51 51_envio_informe_email

> Orden de implementación. Cada paso referencia los `R<n>` que cubre. Depende de #49 (servicio
> email) implementado: `sendEmail`, `email_log`, plantilla reservada `envio_informe_cliente`.
> **No requiere migración SQL** (marca de "enviado" derivada de `email_log`).

- [ ] T1 — Completar el cuerpo de la plantilla **`envio_informe_cliente`** en
  `src/lib/server/email/templates.ts`: `render(data)` → `{ subject, html, text }` branded SyS
  (layout #49, tokens `--sys-*`), con CTA "Ver el informe" → `informeUrl` y link "Versión
  imprimible" → `pdfUrl`; sin material interno. Schema de #49 sin cambios. Cubre: R4.

- [ ] T2 — Extender `tests/email-templates.test.ts`: render de `envio_informe_cliente` produce
  HTML+texto branded con `informeUrl`/`pdfUrl`; fixture con `upsell_findings`/`internal_draft` →
  ninguno de sus textos aparece (test explícito). Cubre: R4.

- [ ] T3 — Crear `src/lib/server/informe/enviar.ts`: `enviarInformeSchema` (Zod `to` email),
  `enviarInforme(...)` (asegura share activo reusando `getActiveShareByReport`/`createReportShare`
  de #15, arma `data` sin campos internos, llama `sendEmail`, traduce a `EnviarInformeResult`),
  y `listInformeEnvios(reportId, empresaEmail)` sobre `email_log`. Cubre: R2, R3, R4, R7, R8.

- [ ] T4 — `tests/informe-enviar.test.ts`: schema acepta/rechaza destinatario (R3); `data` armado
  no incluye `clientDraft`/`upsell`/`internal` (R4); `listInformeEnvios` devuelve destinatario+fecha
  ordenados (R7). Cubre: R3, R4, R7.

- [ ] T5 — Crear endpoint `POST /api/audits/[id]/report/[version]/enviar`: carga audit/report/empresa,
  `requireReportReadAccess` (401/403), guard `aprobado` (409), `enviarInformeSchema` (400), llama
  `enviarInforme`, mapea `fallido`→502 genérico, éxito/dry_run→200 envelope. Cubre: R2, R3, R5, R7, R8.

- [ ] T6 — `tests/api/informe-enviar.test.ts`: 401 sin sesión, 403 técnico no asignado, 200 admin y
  técnico asignado (R5); 409 informe borrador (R2); 400 destinatario inválido (R3); una fila
  `email_log` por envío (R7); 502 genérico ante `sendEmail` fallido sin filtrar `SMTP_*` (R8). Cubre:
  R2, R3, R5, R7, R8.

- [ ] T7 — `tests/informe-enviado.test.ts`: marca "enviado" derivada de `email_log` (destinatario +
  fecha); reenvío agrega fila. Cubre: R7.

- [ ] T8 — Extender `load` de `.../informe/[version]/+page.server.ts`: con `status==='aprobado'`,
  exponer `empresa.email` (prefill) y `listInformeEnvios(report.id, empresa.email)` (marca). Cubre:
  R1, R7.

- [ ] T9 — Crear `src/lib/components/informe/enviar-informe-dialog.svelte` (modal confirmación,
  destinatario prefilleado/editable, validación cliente) y montar en
  `.../informe/[version]/+page.svelte`: botón "Enviar por mail" (habilitado solo aprobado + email
  válido), llamada al endpoint, toast #38, lista "informe enviado". Cubre: R1, R3, R6, R7, R8.

- [ ] T10 — `e2e/envio-informe-email.spec.ts`: informe aprobado (fixture #14 `INFORME_FAKE=1`) →
  botón habilitado → confirmación prefilleada → enviar (dry-run #49) → toast éxito → marca
  "informe enviado"; botón deshabilitado con borrador / empresa sin email. Cubre: R1, R3, R6, R7, R9.

- [ ] T11 — Verificación final: `pnpm run check`, `pnpm test` y
  `pnpm exec playwright test e2e/envio-informe-email.spec.ts` en verde sin SMTP real. Actualizar el
  mapa de trazabilidad en `progress/impl_51_envio_informe_email.md` (cada R con su test). Cubre: R9.
