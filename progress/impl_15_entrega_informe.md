# Impl #15 — 15_entrega_informe

> Trazabilidad R → test. Implementación T1–T16 completada; pendiente reviewer.

## Verificación

| Gate | Resultado |
|---|---|
| `pnpm test` | 451 passed, 2 skipped |
| `pnpm run check` | 0 errores |
| `./init.sh` | exit 0 |
| `pnpm exec playwright test e2e/entrega-informe.spec.ts` | 1 passed (~38s) |

## Trazabilidad R → test

| Req | Tests |
|---|---|
| R1 | `tests/api/informe-share-public.test.ts` (GET vigente 200 sin sesión) · `e2e/entrega-informe.spec.ts` |
| R2 | `tests/informe-share.test.ts` (resolve `{ ok: false }`) · `tests/api/informe-share-public.test.ts` (404 uniforme) |
| R3 | `tests/informe-share.test.ts` (token 43 chars) · `tests/api/informe-share-admin.test.ts` (POST crea fila) |
| R4 | `tests/informe-share.test.ts` (createReportShare 409) · `tests/api/informe-share-admin.test.ts` (401/403/409) |
| R5 | `tests/api/informe-share-admin.test.ts` (regenerar) · `tests/api/informe-share-public.test.ts` (token viejo 404) |
| R6 | `tests/api/informe-share-admin.test.ts` (DELETE) · `tests/api/informe-share-public.test.ts` (revocado 404) |
| R7 | `tests/informe-share.test.ts` (computeExpiresAt) · `tests/api/informe-share-admin.test.ts` (400) · `tests/api/informe-share-public.test.ts` (expirado 404) |
| R8 | `tests/api/informe-share-admin.test.ts` (GET metadatos) · `e2e/entrega-informe.spec.ts` (panel Entrega al cliente) |
| R9 | `tests/api/informe-share-public.test.ts` (view_count) · `tests/api/informe-share-admin.test.ts` (stats GET) · `e2e/entrega-informe.spec.ts` |
| R10 | `tests/informe-web-render.test.ts` (snapshot template v2) |
| R11 | `tests/informe-web-render.test.ts` (Loom con/sin iframe) |
| R12 | `tests/informe-web-render.test.ts` (sin internos) · `tests/api/informe-share-public.test.ts` (HTML sin internal_draft) |
| R13 | `tests/api/informe-share-public.test.ts` (imprimir 7 páginas) · `e2e/entrega-informe.spec.ts` (botón Descargar PDF) |
| R14 | `tests/api/informe-share-public.test.ts` (noindex + 429) |
| R15 | `pnpm test` suites T10–T13 |
| R16 | `e2e/entrega-informe.spec.ts` |

## Archivos clave (tests T10–T14)

- `tests/informe-share.test.ts` — T10
- `tests/informe-web-render.test.ts` — T11
- `tests/api/informe-share-admin.test.ts` — T12
- `tests/api/informe-share-public.test.ts` — T13
- `e2e/entrega-informe.spec.ts` — T14
- `tests/migrate.test.ts` — migración `006_entrega_informe`
- `tests/fixtures/informe-share.ts` — fixture compartida (draft con índices canónicos vía `sql.json`)

## Notas

- Fixture `seedReportForShare` usa `sql.json()` para `client_draft`/`internal_draft` (evita doble-encoding JSONB).
- E2E reutiliza flujo #14 (`runFullAuditFlow` + `INFORME_FAKE=1`) y abre URL pública en contexto sin cookies.
