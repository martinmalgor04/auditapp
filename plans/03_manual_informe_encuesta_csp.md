# Plan 03: Encuesta manual alineada + race insertManualReport + CSP documentada

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 6307b6d..HEAD -- src/lib/server/informe/manual-serve.ts src/lib/server/informe/survey.ts src/lib/server/db/informe-reports.ts src/routes/api/audits/[id]/report/manual/+server.ts src/lib/components/informe/survey-block.svelte tests/informe-manual.test.ts tests/encuesta-schema.test.ts specs/55_informe_html_manual/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (rompe el form HTML inyectado si no se alinea con Zod; race fix toca SQL concurrente)
- **Depends on**: none
- **Category**: bug / security
- **Planned at**: commit `6307b6d`, 2026-07-10

## Why this matters

Tres defectos en el flujo de informe HTML manual (#55) y encuesta (#47):

1. **A7 — encuesta rota en entrega manual**: `buildSurveyBlock` en `manual-serve.ts` emite `<select>` con enums string (`muy_satisfecho`, `muy_clara`, …) y `conforme_hallazgos` como enums, pero `surveyResponseSchema` en `survey.ts` exige `valoracion_global`/`claridad_informe` enteros 1–5 y `conforme_hallazgos` boolean `'true'|'false'`. El POST público siempre falla validación Zod → el cliente no puede completar la encuesta en HTML manual. El componente Svelte `survey-block.svelte` (informes IA) **sí** usa escala 1–5.

2. **Race en `insertManualReport`**: lee `MAX(version)` y luego `INSERT` con `version+1` fuera de un lock/transacción atómica. Dos POSTs concurrentes a `/api/audits/[id]/report/manual` pueden chocar con `UNIQUE (audit_id, version)` → 500. Hay que serializar el allocate de versión (CTE/`FOR UPDATE`/único INSERT … SELECT).

3. **CSP ausente (documentado, no inventar política)**: el HTML manual se sirve como documento completo **sin** `Content-Security-Policy` (decisión #55: sin iframe sandbox, sin sanitización que rompa animaciones). Eso es riesgo XSS si el HTML subido es malicioso. Este plan **no** impone un CSP estricto que rompa animaciones; documenta el threat model y agrega un header **mínimo endurecible** solo si no rompe el fixture de animaciones — si no hay CSP seguro trivial, dejar comentario + test que aserta la decisión explícita y un follow-up.

## Current state

### Encuesta desalineada

`survey.ts` (fuente de verdad):

```19:36:src/lib/server/informe/survey.ts
export const surveyResponseSchema = z
  .object({
    valoracion_global: z.coerce.number().int().min(1).max(5),
    claridad_informe: z.coerce.number().int().min(1).max(5),
    conforme_hallazgos: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true'),
    comentario: z.string().trim().max(2000).optional().transform((v) => (v ? v : null))
  })
  .strict();
```

`manual-serve.ts` (roto) — excerpt de options:

```142:172:src/lib/server/informe/manual-serve.ts
            <option value="muy_satisfecho">Muy satisfecho</option>
            ...
            <option value="muy_clara">Muy clara</option>
            ...
            <option value="totalmente_conforme">Totalmente conforme</option>
```

Referencia correcta UI IA: `src/lib/components/informe/survey-block.svelte` (`escalas = [1,2,3,4,5]`, radios `true`/`false`).

Spec #55 R22: el bloque inyectado debe usar la **misma** validación `submitSurveyResponse` que #47.

### Race

```420:456:src/lib/server/db/informe-reports.ts
export async function insertManualReport(...): Promise<AuditReportRow | null> {
  const latest = await sql`SELECT version, ... ORDER BY version DESC LIMIT 1`;
  if (!latest[0]) return null;
  const rows = await sql.unsafe(
    `INSERT INTO audit_report (..., version, ...) VALUES ($1, $2, ...)`,
    [auditId, latest[0].version + 1, ...]
  );
```

Constraint: `migrations/004_informe_ia.sql` → `UNIQUE (audit_id, version)`.

### CSP / serving

```71:76:src/lib/server/informe/manual-serve.ts
    return new Response(docWithSurvey, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    });
```

Spec #55 requirements § documento directo: NO iframe sandbox, NO sanitización que rompa animaciones; confianza en uploader admin/asignado.

Tests existentes: `tests/informe-manual.test.ts`, `tests/encuesta-schema.test.ts`. Buscar/crear asserts sobre `injectSurveyBeforeBodyClose` / HTML del form.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Tests manual + encuesta | `pnpm test -- tests/informe-manual.test.ts tests/encuesta-schema.test.ts` | exit 0 |
| Typecheck | `pnpm run check` | exit 0 |
| Suite | `pnpm test` | exit 0 |

## Scope

**In scope**:

- `src/lib/server/informe/manual-serve.ts` — `buildSurveyBlock` / headers de respuesta.
- `src/lib/server/db/informe-reports.ts` — `insertManualReport` atómico.
- `src/routes/api/audits/[id]/report/manual/+server.ts` — mapear unique violation → 409 (no 500).
- `tests/informe-manual.test.ts` — inyección encuesta + race/unique.
- `tests/encuesta-schema.test.ts` — solo si hace falta fixture compartido (preferí no tocar si ya cubre 1–5).
- Comentario de diseño corto **en el código** de `manual-serve.ts` (threat model CSP). **No** editar `docs/` ni `feature_list.json` ni specs EARS salvo que el operador lo pida; si necesitás dejar rastro, un párrafo en el plan DONE / comentario `// #55 threat model: ...` basta.

**Out of scope**:

- Cambiar `surveyResponseSchema` a aceptar los enums viejos (rompería #47 / Svelte).
- Sanitizar/reescribir el HTML del informe (prohibido por #55).
- CSP estricto tipo `default-src 'none'` que rompa scripts/inline del HTML pulido.
- Planes 01/02.
- `survey-block.svelte` salvo como referencia de markup.

## Git workflow

- Branch: `fix/manual-informe-encuesta-csp`
- Commit: `fix(informe): alinear encuesta manual, race version y nota CSP`
- No push/PR sin pedido.

## Steps

### Step 1: Reescribir `buildSurveyBlock` para schema 1–5

Reemplazar los tres `<select>` de enums por controles compatibles con `surveyResponseSchema` y con `survey-block.svelte`:

- `valoracion_global`: `<select>` u opciones `value="1"`…`"5"` (labels en español, p.ej. “1 — Muy baja” … “5 — Muy alta”, o radios).
- `claridad_informe`: igual 1–5.
- `conforme_hallazgos`: dos opciones `value="true"` / `value="false"` (Sí / No) — **no** enums `totalmente_conforme`.
- `comentario`: textarea igual.
- `action="/informe/${token}/encuesta"` y `method="POST"` se mantienen.
- Estado `respondedAt` (gracias) sin cambios.

Ideal: exportar un helper de markup desde un solo lugar, o al menos comentar `// Debe coincidir con surveyResponseSchema / SURVEY_QUESTIONS`.

**Verify** (test unitario sobre `injectSurveyBeforeBodyClose`):

```ts
const out = injectSurveyBeforeBodyClose('<html><body>x</body></html>', 'tok', { id: 's' });
expect(out).toMatch(/name="valoracion_global"/);
expect(out).toMatch(/value="5"/);
expect(out).not.toMatch(/muy_satisfecho/);
expect(out).toMatch(/name="conforme_hallazgos"/);
expect(out).toMatch(/value="true"/);
```

Agregar en `tests/informe-manual.test.ts` (o archivo nuevo `tests/informe-manual-survey-inject.test.ts`).

**Verify cmd**:
```bash
pnpm test -- tests/informe-manual.test.ts
```

### Step 2: Race-safe `insertManualReport`

Reescribir el allocate+insert en **una** sentencia o transacción con lock:

Patrón recomendado (postgres.js tagged o `sql.begin`):

```sql
WITH latest AS (
  SELECT version, canonical_json, schema_version
  FROM audit_report
  WHERE audit_id = $1
  ORDER BY version DESC
  LIMIT 1
  FOR UPDATE
)
INSERT INTO audit_report (...)
SELECT $1, latest.version + 1, 'aprobado', 'manual', latest.canonical_json, ...
FROM latest
RETURNING ...
```

Notas:

- `FOR UPDATE` requiere estar dentro de `sql.begin` / transacción.
- Si no hay `latest`, devolver `null` (R7) como hoy.
- Alternativa aceptable: `INSERT ... SELECT COALESCE(MAX(version),0)+1 ...` en una sola statement **sin** TOCTOU de dos round-trips; si dos corren, uno pega unique → catch `23505`.

En el endpoint `manual/+server.ts`, si el error es unique (`code === '23505'`), devolver `apiError('Conflicto de versión, reintentá', 409)` en lugar de 500 genérico.

**Verify**: test de concurrencia en `tests/informe-manual.test.ts`:

```ts
await Promise.all([
  insertManualReport({ auditId, htmlManual: htmlA, uploadedBy }),
  insertManualReport({ auditId, htmlManual: htmlB, uploadedBy })
]);
const reports = await listReportsByAudit(auditId);
const versions = reports.map(r => r.version);
expect(new Set(versions).size).toBe(versions.length); // sin duplicados
```

Uno puede fallar con null/throw mapeado a 409 a nivel API; a nivel DB no debe quedar corrupción. Si `Promise.all` hace que uno tire, el test debe aceptar “uno OK + uno conflict” **o** ambos OK con versions distintas — documentar el comportamiento elegido en el test.

### Step 3: CSP / headers — documentar + mínimo seguro

En `handleManualInformeRequest`, al armar headers:

1. Agregar comentario de threat model (español o inglés corto):
   - HTML es trusted-uploader content (#55); no sandbox iframe.
   - XSS residual si un admin/técnico comprometido sube script malicioso.
   - CSP estricto deferred: rompería animaciones/inline del HTML pulido.

2. **Header mínimo permitido en este plan** (solo si no rompe tests de contenido):
   - Mantener `X-Robots-Tag: noindex, nofollow`.
   - Agregar `X-Content-Type-Options: nosniff`.
   - **No** agregar `Content-Security-Policy` con `script-src` restrictivo en este plan.
   - Opcional: `Referrer-Policy: no-referrer` si no afecta assets del informe.

3. Test: la Response de serving (si hay test de API pública) o unit del handler aserta `nosniff` y **ausencia** de CSP restrictivo, o aserta el comentario/decisión vía snapshot de headers esperados:

```ts
expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
expect(headers.get('Content-Security-Policy')).toBeNull(); // decisión #55 documentada
```

Si preferís un CSP report-only, **STOP** y no lo inventes sin fixture de animaciones — queda follow-up.

**Verify**:
```bash
rg -n "X-Content-Type-Options|threat model|Content-Security-Policy" src/lib/server/informe/manual-serve.ts
```

### Step 4: Gates

```bash
pnpm run check
pnpm test -- tests/informe-manual.test.ts tests/encuesta-schema.test.ts
pnpm test
```

## Test plan

- Inyección: form con values 1–5 y true/false; **sin** `muy_satisfecho`.
- (Ideal) round-trip: `surveyResponseSchema.safeParse` sobre FormData simulado construido desde el HTML inyectado → success.
- Race: dos inserts concurrentes → versions únicas o un 409 limpio.
- Headers: `nosniff` presente; sin CSP estricto accidental.
- No-regresión: `tests/encuesta-schema.test.ts` sigue verde sin cambiar el schema.

## Done criteria

- [ ] `buildSurveyBlock` compatible con `surveyResponseSchema` (1–5 + boolean).
- [ ] `rg muy_satisfecho src/lib/server/informe/manual-serve.ts` → sin matches.
- [ ] `insertManualReport` no hace TOCTOU de dos queries sin lock/single-statement; unique → 409 en API.
- [ ] Threat model CSP documentado en código; `X-Content-Type-Options: nosniff` en serving manual.
- [ ] `pnpm test -- tests/informe-manual.test.ts tests/encuesta-schema.test.ts` exit 0.
- [ ] `pnpm run check` y `pnpm test` exit 0.
- [ ] Fila 03 en `plans/README.md` → DONE.

## STOP conditions

- Alguien ya “arregló” la encuesta aceptando enums en Zod → STOP; no dual-support sin decisión de producto (rompe fuente única #47).
- El lock `FOR UPDATE` deadlockeá con pool `max:1` en tests (el repo documenta deadlocks por pool=1 en `updateAudit`) → usar single-statement `INSERT…SELECT MAX+1` + catch 23505 en su lugar; si ambos fallan, STOP y reportar.
- Se pide CSP `script-src 'self'` que rompe el HTML gold de animaciones → STOP; dejar solo documentación + nosniff.

## Maintenance notes

- Reviewer: comparar markup inyectado vs `survey-block.svelte` campo a campo.
- Follow-up (no este plan): CSP report-only / hash de scripts del template gold; o servir manual en origen propio con nonces.
- Follow-up escala: plan 04 pool/jobs (no escribir aquí).
