# Implementación — #49 49_servicio_email

## Trazabilidad R → test

| Req | Descripción | Test |
|---|---|---|
| R1 | Config SMTP por `.env`, remitente default | `tests/email-config.test.ts` |
| R2 | Dry-run sin SMTP en dev/test | `tests/email-client.test.ts` |
| R3 | Envío real con transport mockeado en prod | `tests/email-client.test.ts` |
| R4 | Reintento acotado ante fallo transitorio | `tests/email-client.test.ts` |
| R5 | Plantillas HTML+texto branded, Zod | `tests/email-templates.test.ts` |
| R6 | Migración idempotente `email_log` | `tests/email-schema.test.ts` |
| R7 | Registro por intento en `email_log` | `tests/email-log.test.ts` |
| R8 | Aviso auditoría asignada | `tests/email-eventos.test.ts` |
| R9 | Aviso briefing completado | `tests/email-eventos.test.ts` |
| R10 | Aviso informe aprobado | `tests/email-eventos.test.ts` |
| R11 | Destinatarios admin + técnicos | `tests/email-eventos.test.ts` |
| R12 | Opt-out `notify_internal_email` | `tests/email-schema.test.ts`, `tests/email-eventos.test.ts` |
| R13 | Fallo de email no rompe operación | `tests/email-eventos.test.ts` |
| R14 | Logs sin secretos SMTP | `tests/email-client.test.ts` |
| R15 | Suite email ejecutable sin SMTP externo | todos `tests/email-*.test.ts` |
| R16 | Aviso auditoría cerrada | `tests/email-eventos.test.ts` |
| R17 | Aviso feedback encuesta #47 | `tests/email-eventos.test.ts` |

## Archivos principales

- `migrations/026_servicio_email.sql`
- `src/lib/server/email/{index,transport,templates,layout,notify}.ts`
- `src/lib/server/db/email-log.ts`
- Hooks: `backoffice/audits.ts`, `briefing/submit.ts`, `approve/+server.ts`, `scoring/persist.ts`, `informe/survey.ts`
- `.env.example` — bloque SMTP #49

## Verificación

- `pnpm run check` — OK
- `pnpm test tests/email-*.test.ts` — 37/37 OK
- `./init.sh` — pendiente suite completa (ejecutar en CI/local)
