import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { ensureEmpresaCodigo } from '../../src/lib/server/backoffice/audits';
import { buildEmpresaCode } from '../../src/lib/server/clients/normalize';
import { setupTestDb, teardownTestDb } from '../helpers/db';

describe('ensureEmpresaCodigo — colisión runtime (#41 R2)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('ISX ocupado → asigna ISX2 para otra razón social con misma base', async () => {
    const cuit1 = '30-99000091-1';
    const cuit2 = '30-99000092-2';
    await sql`DELETE FROM audit_ref_counter WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit IN (${cuit1}, ${cuit2}))`;
    await sql`DELETE FROM audit WHERE empresa_id IN (SELECT id FROM empresa WHERE cuit IN (${cuit1}, ${cuit2}))`;
    await sql`DELETE FROM empresa WHERE cuit IN (${cuit1}, ${cuit2}) OR codigo IN ('ISX', 'ISX2')`;

    await sql`
      INSERT INTO empresa (razon_social, cuit, relacion, codigo)
      VALUES ('Empresa ISX Original SA', ${cuit1}, 'cliente', 'ISX')
    `;

    const razonNueva = 'INGENIERIA SIGLO XXI SA';
    expect(buildEmpresaCode(razonNueva)).toBe('ISX');

    const codigo = await sql.begin((tx) => ensureEmpresaCodigo(tx, null, razonNueva));
    expect(codigo).toBe('ISX2');
  });
});
