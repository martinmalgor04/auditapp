# Verificación — Cómo demostrar que el trabajo funciona

> Regla de oro: **el agente no dice "funciona", lo demuestra**.

## Niveles de verificación

### Nivel 1 — Tests unitarios (obligatorio)

Toda función pública en `src/lib/` tiene al menos un test en `tests/` que:

1. Cubre el camino feliz.
2. Cubre al menos un camino de error si puede fallar.

```bash
npx vitest run
```

### Nivel 2 — Tests de integración (obligatorio para API/DB)

Features que tocan Postgres o API routes:

```bash
npx vitest run tests/api/
```

Usar DB de test o transacciones con rollback. No mocks del query layer.

### Nivel 3 — E2E (obligatorio para flujos críticos)

Briefing, form técnico, cierre:

```bash
npx playwright test
```

### Nivel 4 — Trazabilidad requirements (obligatorio para `sdd: true`)

Cada `R<n>` de `specs/<name>/requirements.md` mapea a al menos un test.
El implementer documenta en `progress/impl_<name>.md`:

```markdown
## Trazabilidad
- R1 → `audit-create.test.ts > creates audit with valid template`
- R2 → `audit-create.test.ts > rejects missing client_id`
```

El reviewer rechaza si falta cobertura.

### Nivel 5 — Typecheck y lint

```bash
npm run check    # svelte-check
npx tsc --noEmit
npx eslint .
```

## Anti-patrones

- ❌ "Debería funcionar" sin test ejecutable.
- ❌ Test que solo verifica que no lanza — debe comprobar resultado concreto.
- ❌ Marcar `done` sin `./init.sh` verde.
- ❌ E2E que depende de estado manual en DB sin seed/fixture.

## Verificación final antes de cerrar

```bash
./init.sh           # debe terminar con [OK] Entorno listo
```

Si `./init.sh` está rojo, marca `blocked` en `feature_list.json` y anota en
`progress/current.md`.

## Pre-scaffolding

Mientras no exista `package.json` (feature #1 pendiente), `./init.sh` emite
`[WARN]` en tests pero puede pasar si el arnés y `feature_list.json` son válidos.
