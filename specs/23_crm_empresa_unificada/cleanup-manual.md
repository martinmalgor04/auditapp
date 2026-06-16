# Limpieza manual posterior — #23 23_crm_empresa_unificada (Fase 6)

> **Estado:** procedimiento documentado, **NO ejecutado**. Fuera del alcance de #23.
>
> Decisión humana (2026-06-16, decisión 8): `crm_lead`, `crm_lead_event` y la vista de
> compatibilidad `client` se **conservan como red de rollback/backup** tras el fold a `empresa`
> (migración 015). La Fase 6 de #23 solo los **deprecó documentadamente** (migración
> `017_empresa_deprecacion.sql`, `COMMENT ON` "DEPRECADO #23, conservar para rollback, no
> escribir"). **Ningún `DROP`.** Este documento describe la limpieza física **futura y manual**,
> a ejecutar en una tarea/feature dedicada cuando se confirme que ya no hay lectores legacy.

---

## 1. Qué se conserva hoy (post-#23) y por qué

| Objeto | Tipo | Estado tras #23 | Por qué se conserva |
|---|---|---|---|
| `crm_lead` | tabla base | Datos foldeados en `empresa` (migr. 015). Marcada DEPRECADO (migr. 017). | Backup de los leads originales por si hay que reconstruir/auditar el fold. |
| `crm_lead_event` | tabla base | Historial migrado a `empresa_evento` (migr. 015). Marcada DEPRECADO (migr. 017). | Backup del historial de estados de leads. |
| `client` | **vista** (`SELECT * FROM empresa`) | Vista de compatibilidad (migr. 015). Marcada DEPRECADO (migr. 017). | Red de seguridad para cualquier lector legacy aún no reconectado a `empresa`. |
| `src/lib/server/db/crm-leads.ts` | código | Conservado, sin reescribir. | Referencia + lo siguen usando los tests `tests/api/crm-leads.test.ts`. |
| `src/lib/server/crm/state-machine.ts` | código | Conservado, sin reescribir. | Referencia de la máquina de estados de leads; usado por `tests/crm-state-machine.test.ts`. |

> **No se aplicó `REVOKE`.** El rol de conexión de la app (`auditapp`) es **dueño** de las
> tablas y la vista. En Postgres el dueño conserva acceso pleno sin importar los GRANT/REVOKE, así
> que revocar escritura desde el owner sería un no-op engañoso; además la vista `client` todavía
> recibe INSERT/UPDATE del seed dev y de lectores legacy. La prohibición real de escritura se
> sostiene por convención + esta documentación, no por privilegios. (Detalle en el encabezado de
> `migrations/017_empresa_deprecacion.sql`.)

---

## 2. Precondición OBLIGATORIA antes de cualquier `DROP`

**Ningún lector/escritor en uso** debe depender de los objetos legacy. Verificar TODO lo siguiente
y dejar evidencia antes de dropear:

1. **Código de app sin referencias a la vista `client` ni a `crm_lead`/`crm_lead_event`:**

   ```bash
   # No debe quedar SQL de producción que lea/escriba la vista client ni las tablas legacy.
   grep -rniE "\b(INTO|FROM|JOIN|UPDATE|DELETE FROM)\s+client\b" src/ \
     | grep -viE "empresa|clientImport|ClientPicker|ClientCab|client-map|clients-import|searchClients|getClient"
   grep -rniE "\bcrm_lead(_event)?\b" src/
   ```

   - Hoy (cierre de #23) `src/` ya **no** lee la vista `client` en caminos calientes: import, form de
     auditoría, mercado, dashboard y cockpit están reconectados a `empresa` (Fases 2–5). Las únicas
     referencias remanentes a `crm_lead*` viven en `src/lib/server/db/crm-leads.ts` y la
     state-machine, que son **legacy de referencia** (no se invocan desde rutas activas del cockpit
     nuevo) y sus tests. Re-verificar este grep antes de dropear.

2. **Tests que dependen de los objetos legacy retirados o reescritos primero:**
   - `tests/api/crm-leads.test.ts` (ejercita `crm-leads.ts` → `crm_lead`/`crm_lead_event`).
   - `tests/crm-state-machine.test.ts` (state machine de leads).
   - `tests/empresa-compat.test.ts` (verifica que la **vista `client`** existe y refleja `empresa`).
   - `tests/clients-cuit-cleanup.test.ts` (replay adaptado de 013; usa nombres post-015).
   - Helpers que truncan/leen estas tablas: `tests/helpers/db.ts` (`truncateSeedTablesUnsafe`,
     `resetVolatileTablesUnsafe`) — ya apuntan a `empresa`/`empresa_evento`, pero revisar que no
     vuelvan a tocar `client`/`crm_lead`.

3. **Rollback ya no necesario:** confirmar con negocio/Martín que el fold de 015 está validado en
   producción y que no se requiere reconstruir desde `crm_lead*` (los counts del fold están en
   `progress/impl_23_crm_empresa_unificada.md`, sección "Hallazgos reales de la DB").

4. **Backup externo:** tomar un `pg_dump` de `crm_lead` y `crm_lead_event` (datos) antes del drop,
   guardado fuera de la DB, por si se necesita auditoría histórica tras la limpieza.

---

## 3. Orden de `DROP` (respetando las FK)

Dependencias relevantes (verificadas en el catálogo, Fase 6):

```
crm_lead_event.lead_id      → crm_lead(id)        (crm_lead_event_lead_id_fkey)
crm_lead_event.changed_by   → app_user(id)
crm_lead.client_id          → empresa(id)         (crm_lead_client_id_fkey)   ← FK HACIA empresa
crm_lead.audit_id           → audit(id)
audit.empresa_id            → empresa(id)          (NO se toca: es la FK viva del modelo nuevo)
empresa_evento.empresa_id   → empresa(id)          (NO se toca: modelo nuevo)
```

`crm_lead_event` depende de `crm_lead`; `crm_lead` referencia a `empresa` (no al revés), así que
dropear las tablas legacy **no** afecta a `empresa` ni a sus FK vivas. La vista `client` no tiene
dependientes propios (es un `SELECT *` sobre `empresa`).

**Migración de limpieza FUTURA (ejemplo — NO ejecutar en #23):**

```sql
-- migrations/0NN_empresa_cleanup_legacy.sql   (FUTURO — solo tras cumplir la §2)
-- 1) Tabla hija primero (FK a crm_lead).
DROP TABLE IF EXISTS crm_lead_event;
-- 2) Luego la tabla de leads (su FK es HACIA empresa; dropearla no afecta a empresa).
DROP TABLE IF EXISTS crm_lead;
-- 3) Por último la vista de compatibilidad.
DROP VIEW IF EXISTS client;
```

> Usar el **siguiente número libre** de `migrations/` en ese momento (hoy el último es 017).
> Mantener `IF EXISTS` para que la migración sea idempotente. El runner envuelve el archivo en
> `sql.begin` (atómico): si algo falla, no se aplica nada.

### Código a borrar en esa misma limpieza futura (no en #23)

- `src/lib/server/db/crm-leads.ts`
- `src/lib/server/crm/state-machine.ts` (y `src/lib/crm/view.ts` si quedó huérfano)
- Tests: `tests/api/crm-leads.test.ts`, `tests/crm-state-machine.test.ts`,
  `tests/empresa-compat.test.ts` (la vista `client` dejaría de existir).
- Limpiar de `tests/helpers/db.ts` cualquier referencia residual a `client`/`crm_lead`.

---

## 4. Verificación posterior al drop (cuando se ejecute, FUTURO)

1. `pnpm run check` → 0 errores (no quedan tipos/imports colgando de los módulos borrados).
2. `pnpm run build` → OK.
3. `pnpm test` → verde (con los tests legacy ya retirados).
4. `./init.sh` → gate verde (asumiendo resuelta la condición de ">1 in_progress").
5. Confirmar en la DB: `crm_lead`, `crm_lead_event` y la vista `client` ya no existen; `empresa`,
   `empresa_evento` y la FK `audit.empresa_id` intactas; counts de `empresa` sin cambios.

---

## 5. Resumen

| | #23 (esta feature) | Limpieza manual (futura) |
|---|---|---|
| `crm_lead` / `crm_lead_event` | `COMMENT ON` DEPRECADO (migr. 017). Conservadas. | `DROP TABLE` (hija primero). |
| vista `client` | `COMMENT ON` DEPRECADO (migr. 017). Conservada. | `DROP VIEW`. |
| `crm-leads.ts` + state-machine | Conservados como referencia. | Borrar. |
| `DROP` ejecutado | **NINGUNO.** | Sí, tras cumplir la precondición §2. |
