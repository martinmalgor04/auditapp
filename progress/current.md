# Sesión actual

**Feature activa:** #43 `43_mercado_accionable` (in_progress)

**Estado:**
- T1–T11 implementadas. Evolución aditiva de #18: 5 bloques accionables (migración Tango, mapa NEA,
  salud base instalada, hallazgos recurrentes interno, riesgo/retención interno) + filtro provincia.
- Cero migraciones, solo lectura, sin tocar scoring. `estadoSelectSql` exportado como fuente única
  de estado (R15). Anonimización en `aggregate.ts` (R13/R16).
- Trazabilidad R1–R20 en `progress/impl_43_mercado_accionable.md`.
- `pnpm run check`: 0 errores. Tests de dominio/API de mercado verdes. Suite completa + e2e + init.sh
  en ejecución para cierre.

**Verificación:**
- `pnpm run check`: 0 errores. e2e `e2e/mercado.spec.ts`: 6/6 verde (build prod incluido).
- Tests de #43/#18/empresa/crm/pwa aislados: 87/87 verde.
- `pnpm test` completo: rojo por flake pre-existente ajeno a #43 (fuga de mock `fetch` a
  `pwa-prod` + contención de sockets Postgres bajo carga). Detalle en
  `progress/impl_43_mercado_accionable.md`.

**Próximo paso:**
- Revisor: validar trazabilidad R1–R20 y decidir tratamiento del flake del arnés antes de `done`/commit.
