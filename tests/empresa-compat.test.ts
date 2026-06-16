import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from './helpers/db';

/**
 * #23 Fase 1 — compatibilidad hacia atrás (R30). Mientras el rollout está en curso, `client`
 * sobrevive como VISTA sobre `empresa` para que los lectores/escritores legacy (mercado, audits,
 * seed, import) sigan funcionando sin reconectar.
 */
describe('compat vista client (#23 Fase 1 — R30)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('R30: client es una VISTA (no una tabla base)', async () => {
    const [row] = await sql<{ relkind: string }[]>`
      SELECT relkind FROM pg_class WHERE relname = 'client'
    `;
    expect(row?.relkind).toBe('v');
  });

  it('R30: la vista client devuelve exactamente las mismas filas que empresa', async () => {
    const [viaView] = await sql<{ n: number }[]>`SELECT count(*)::int n FROM client`;
    const [viaBase] = await sql<{ n: number }[]>`SELECT count(*)::int n FROM empresa`;
    expect(viaView.n).toBe(viaBase.n);

    // Sin filas presentes en una y no en la otra (en ambos sentidos).
    const [{ n: onlyView }] = await sql<{ n: number }[]>`
      SELECT count(*)::int n FROM (
        SELECT id FROM client EXCEPT SELECT id FROM empresa
      ) q
    `;
    const [{ n: onlyBase }] = await sql<{ n: number }[]>`
      SELECT count(*)::int n FROM (
        SELECT id FROM empresa EXCEPT SELECT id FROM client
      ) q
    `;
    expect(onlyView).toBe(0);
    expect(onlyBase).toBe(0);
  });

  it('R30: un INSERT/UPDATE/DELETE a través de la vista client llega a empresa', async () => {
    const razon = 'Compat Insert ' + Date.now();
    await sql`DELETE FROM empresa WHERE razon_social = ${razon}`;

    // Escritor legacy: INSERT a `client` SIN informar relacion (usa el DEFAULT 'prospecto').
    await sql`
      INSERT INTO client (razon_social, cuit, origen)
      VALUES (${razon}, NULL, 'presupuestos')
    `;
    const [base] = await sql<{ relacion: string }[]>`
      SELECT relacion FROM empresa WHERE razon_social = ${razon}
    `;
    expect(base).toBeTruthy();
    expect(base.relacion).toBe('prospecto'); // DEFAULT aplicado al insertar por la vista

    await sql`UPDATE client SET rubro = 'Test' WHERE razon_social = ${razon}`;
    const [updated] = await sql<{ rubro: string }[]>`
      SELECT rubro FROM empresa WHERE razon_social = ${razon}
    `;
    expect(updated.rubro).toBe('Test');

    await sql`DELETE FROM client WHERE razon_social = ${razon}`;
    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int n FROM empresa WHERE razon_social = ${razon}
    `;
    expect(n).toBe(0);
  });

  it('R30: el JOIN legacy de audits (audit ⨝ client) sigue resolviendo razón social', async () => {
    const razon = 'Compat Join Audit ' + Date.now();
    await sql`DELETE FROM empresa WHERE razon_social = ${razon}`;

    const [emp] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, origen, relacion)
      VALUES (${razon}, 'presupuestos', 'cliente') RETURNING id
    `;
    const token = 'tok-compat-' + Date.now();
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audit (empresa_id, name, types, template_ids, segment, status, public_token)
      VALUES (${emp.id}::uuid, 'Audit compat', ARRAY['it']::text[], ARRAY[]::uuid[], 'A',
              'en_relevamiento', ${token})
      RETURNING id
    `;

    // Patrón legacy de mercado/audits: JOIN client c ON c.id = a.empresa_id.
    const [row] = await sql<{ razon_social: string }[]>`
      SELECT c.razon_social
      FROM audit a JOIN client c ON c.id = a.empresa_id
      WHERE a.id = ${audit.id}
    `;
    expect(row.razon_social).toBe(razon);

    await sql`DELETE FROM audit WHERE id = ${audit.id}`;
    await sql`DELETE FROM empresa WHERE id = ${emp.id}`;
  });
});
