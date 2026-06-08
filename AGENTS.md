# AGENTS.md — Mapa de navegación para agentes de IA

> Punto de entrada para cualquier agente en este repositorio. No es una biblia
> de reglas: es un **mapa**. Lee solo lo que necesites (divulgación progresiva).

**Harness primario:** Cursor (`.cursor/agents/`, `.cursor/hooks.json`).
**Espejo:** Claude Code (`.claude/agents/`, `.claude/settings.json`).

---

## 1. Antes de empezar (obligatorio)

1. Ejecuta `./init.sh` y verifica que termina sin errores. Si falla, **para**
   y resuelve el entorno antes de tocar código.
2. Lee `progress/current.md` para entender en qué estado quedó la última sesión.
3. Lee `feature_list.json`. Toda feature con `"sdd": true` pasa por
   **Spec Driven Development** — ver `docs/specs.md` y §4.
4. Material de referencia histórico (NO fuente viva): `docs/source-specs/`.

## 2. Mapa del repositorio

| Archivo / carpeta | Qué contiene | Cuándo leerlo |
|---|---|---|
| `feature_list.json` | Backlog con estado (`pending` / `spec_ready` / `in_progress` / `done` / `blocked`) | Siempre, al empezar |
| `progress/current.md` | Estado de la sesión actual | Siempre, al empezar |
| `progress/history.md` | Bitácora append-only de sesiones anteriores | Si necesitas contexto histórico |
| `specs/<feature>/` | `requirements.md` + `design.md` + `tasks.md` (EARS) | Antes de implementar cualquier feature `sdd: true` |
| `docs/architecture.md` | Qué significa "hacer un buen trabajo" en auditapp | Antes de implementar |
| `docs/conventions.md` | Estilo, nombres, estructura TypeScript/SvelteKit | Antes de escribir código |
| `docs/specs.md` | Proceso SDD: EARS, los 3 archivos, puerta humana | Antes de redactar o leer un spec |
| `docs/verification.md` | Cómo verificar (vitest, playwright, trazabilidad R↔test) | Antes de declarar `done` |
| `docs/source-specs/` | PRDs y specs SPEC-07 archivadas (referencia) | Al redactar specs EARS |
| `CHECKPOINTS.md` | Criterios objetivos de estado final | Para auto-evaluarte |
| `.cursor/agents/` | `leader`, `spec_author`, `implementer`, `reviewer` | Si orquestas trabajo en Cursor |
| `src/` | Código SvelteKit (aparece tras feature #1) | Para implementar |
| `migrations/` | SQL versionado (postgres.js, sin ORM) | Features de datos |
| `tests/` / `e2e/` | vitest + playwright | Para verificar |

## 3. Reglas duras (no negociables)

- **Una sola feature a la vez.** No mezcles cambios de varias tareas en la misma sesión.
- **No declares `done` sin pruebas verdes.** Ejecuta `./init.sh` al 100%.
- **No saltes la fase de spec.** Toda feature `"sdd": true` pasa por `spec_author`
  y aprobación humana antes de código.
- **No saltes la puerta humana.** El leader para en `spec_ready` y espera.
- **Documenta en `progress/current.md`** mientras trabajas, no al final.
- **Deja el repo limpio** antes de cerrar la sesión (ver §5).
- **No commitees secretos** (.env, claves, tokens).
- **Responde en español** salvo que el humano pida otro idioma.

## 4. Flujo de trabajo (SDD)

```
pending → [spec_author] → spec_ready → ⏸ HUMANO → in_progress → [implementer → reviewer] → done
```

1. El leader detecta la primera feature `pending` con `"sdd": true` (menor `id`).
2. El `spec_author` crea `specs/<name>/{requirements,design,tasks}.md`
   reutilizando `docs/source-specs/` y marca `spec_ready`.
3. **Pausa.** El humano lee el spec y aprueba (o pide cambios).
4. Tras aprobación, el leader cambia a `in_progress` y lanza `implementer`.
5. El implementer ejecuta `tasks.md` una a una, marcando `[x]`.
6. El reviewer verifica trazabilidad `R<n>` ↔ test y tasks completas.
7. Si aprueba → `done` y resumen a `progress/history.md`.

**Entrada al flujo en Cursor:** comando `/leader` o agente `@leader`.

## 5. Cierre de sesión (lifecycle)

1. Ejecuta `./init.sh` — todo verde.
2. Si la tarea está acabada: marca `status: "done"` en `feature_list.json`.
3. Mueve el resumen de `progress/current.md` al final de `progress/history.md`.
4. Vacía `progress/current.md` dejando solo la plantilla.
5. No dejes archivos temporales, `console.log` de debug, ni TODOs sin contexto.

## 6. Si te bloqueas

- Relee la sección relevante de `docs/`.
- Consulta `docs/source-specs/` para contexto de negocio.
- Si la herramienta no hace lo esperado, documenta el bloqueo en
  `progress/current.md` y marca `blocked` en `feature_list.json`.
