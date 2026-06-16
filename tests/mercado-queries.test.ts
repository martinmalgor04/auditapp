import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import {
  fetchUniverseCount,
  fetchErpDistribution,
  fetchIndicesByRubro,
  listMercadoRubros
} from '../src/lib/server/mercado/queries';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserIdByEmail, findUserByEmail } from './helpers/auth';
import { getTemplateIdByCode } from './helpers/backoffice';

/**
 * Fase 3 #23 (T13, R28): el dashboard de mercado resuelve sus ~10 JOIN contra la tabla
 * base `empresa` (no la vista `client`). Se inserta una empresa directamente en `empresa`
 * con datos maestros propios (rubro/erp_actual) y se verifica que las queries la
 * recuperan: si el join apuntara a otra tabla, esos campos no aparecerían.
 */
describe('#23 Fase 3 — mercado queries contra empresa (R28)', () => {
  let sql: postgres.Sql;
  const rubro = 'RubroMercadoFase3';
  const erp = 'ErpMercadoFase3';

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function insertClosedAuditWithEmpresa(opts: {
    razonSocial: string;
    cuit: string;
    rubro: string;
    erp: string;
    indiceIt: number;
    indiceErp: number;
  }): Promise<{ auditId: string; empresaId: string }> {
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    if (!tech) throw new Error('tech not found');
    const techId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');

    await sql`DELETE FROM empresa WHERE cuit = ${opts.cuit}`;

    // Insert directo en la tabla base empresa (no la vista) con datos maestros.
    const [emp] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion, rubro, erp_actual)
      VALUES (${opts.razonSocial}, ${opts.cuit}, 'cliente', ${opts.rubro}, ${opts.erp})
      RETURNING id
    `;

    const types = ['it', 'erp-tango'];
    const templateIds = await Promise.all(types.map((t) => getTemplateIdByCode(sql, t)));
    const closedAt = new Date('2026-05-10T12:00:00Z');

    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audit (
        empresa_id, name, types, template_ids, segment, status,
        assigned_tech_id, closed_at
      )
      VALUES (
        ${emp.id},
        ${'Auditoría ' + opts.razonSocial},
        ${types},
        ${templateIds}::uuid[],
        'A',
        'cerrada',
        ${techId},
        ${closedAt}
      )
      RETURNING id
    `;

    await sql`
      INSERT INTO audit_closure (
        audit_id, indice_it, indice_erp, upsell_findings, closed_at, closed_by
      )
      VALUES (
        ${audit.id},
        ${opts.indiceIt},
        ${opts.indiceErp},
        ${sql.json([] as never)},
        ${closedAt},
        ${techId}
      )
    `;

    return { auditId: audit.id, empresaId: emp.id };
  }

  it('el universo cuenta la auditoría cerrada cuya empresa vive en la tabla base', async () => {
    const before = await fetchUniverseCount({});
    await insertClosedAuditWithEmpresa({
      razonSocial: 'Mercado Empresa Base SA',
      cuit: '30-75555555-7',
      rubro,
      erp,
      indiceIt: 70,
      indiceErp: 60
    });
    const after = await fetchUniverseCount({});
    expect(after).toBe(before + 1);
  });

  it('el JOIN recupera datos maestros (erp_actual, rubro) desde empresa', async () => {
    await insertClosedAuditWithEmpresa({
      razonSocial: 'Mercado Empresa Erp SA',
      cuit: '30-76666666-8',
      rubro,
      erp,
      indiceIt: 80,
      indiceErp: 65
    });

    const erpDist = await fetchErpDistribution({});
    const erpHit = erpDist.find((r) => r.key === erp);
    expect(erpHit?.n).toBeGreaterThanOrEqual(1);

    const byRubro = await fetchIndicesByRubro({});
    const rubroHit = byRubro.find((r) => r.key === rubro);
    expect(rubroHit?.n).toBeGreaterThanOrEqual(1);

    const rubros = await listMercadoRubros();
    expect(rubros).toContain(rubro);
  });
});
