import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import {
  createAudit,
  getAuditById,
  searchClientsForPicker
} from '../src/lib/server/backoffice/audits';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserIdByEmail } from './helpers/auth';
import { getCabItemId } from './helpers/backoffice';

/**
 * Fase 3 #23 (T12, R27): el ClientPicker y createAudit del form de nueva auditoría
 * leen/escriben la tabla base `empresa` (no la vista `client`). FK de audit válida hacia
 * empresa, CAB precargado, empresa nueva toma relacion='prospecto' y sin regresión.
 */
describe('#23 Fase 3 — createAudit/picker sobre empresa (R27)', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let tecnicoId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    tecnicoId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('searchClientsForPicker resuelve filas desde la tabla base empresa (relkind r)', async () => {
    // empresa es tabla base ('r'); client es vista ('v') tras la migración 015.
    const [{ relkind }] = await sql<{ relkind: string }[]>`
      SELECT relkind FROM pg_class WHERE relname = 'empresa'
    `;
    expect(relkind).toBe('r');

    const cuit = '30-71111111-3';
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    const [emp] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion, rubro)
      VALUES ('Picker Empresa Base SRL', ${cuit}, 'cliente', 'Industria')
      RETURNING id
    `;

    const byName = await searchClientsForPicker('Picker Empresa Base');
    const hit = byName.find((r) => r.id === emp.id);
    expect(hit).toBeTruthy();
    expect(hit!.razonSocial).toBe('Picker Empresa Base SRL');
    expect(hit!.cabFields.rubro).toBe('Industria');

    const byCuit = await searchClientsForPicker(cuit);
    expect(byCuit.some((r) => r.id === emp.id)).toBe(true);
  });

  it('empresa existente: createAudit vincula la FK a empresa y precarga CAB', async () => {
    const cuit = '30-72222222-4';
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;
    const [emp] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, cuit, relacion)
      VALUES ('Empresa Existente CAB SA', ${cuit}, 'cliente')
      RETURNING id
    `;

    const { id } = await createAudit(
      {
        clientId: emp.id,
        types: ['it'],
        segment: 'B',
        techByType: { it: tecnicoId },
        scheduledAt: '2026-07-01',
        cabResponses: {}
      },
      adminId
    );

    // FK audit.empresa_id apunta a la empresa elegida.
    const [audit] = await sql<{ empresa_id: string }[]>`
      SELECT empresa_id FROM audit WHERE id = ${id}
    `;
    expect(audit.empresa_id).toBe(emp.id);

    const detail = await getAuditById(id);
    expect(detail?.status).toBe('borrador');
    expect(detail?.clientId).toBe(emp.id);
    const byLabel = new Map(detail!.cabItems.map((i) => [i.label, i.value]));
    expect(byLabel.get('Razón social')).toBe('Empresa Existente CAB SA');
    expect(byLabel.get('CUIT')).toBe(cuit);
    expect(byLabel.get('Fecha programada de visita')).toBe('2026-07-01');
  });

  it("empresa nueva: createAudit la crea en empresa con relacion='prospecto' y FK válida", async () => {
    const cuit = '30-73333333-5';
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;

    const { id } = await createAudit(
      {
        newClient: {
          razonSocial: 'Empresa Nueva Desde Form SRL',
          cuit,
          rubro: 'Comercio'
        },
        types: ['it'],
        segment: 'A',
        techByType: { it: tecnicoId },
        scheduledAt: '2026-08-01',
        cabResponses: {}
      },
      adminId
    );

    const detail = await getAuditById(id);
    expect(detail).toBeTruthy();

    // La empresa nueva existe en la tabla base con la relacion por defecto del form clásico.
    const [emp] = await sql<
      { id: string; relacion: string; razon_social: string; cuit: string; rubro: string }[]
    >`
      SELECT id, relacion, razon_social, cuit, rubro
      FROM empresa
      WHERE id = ${detail!.clientId}
    `;
    expect(emp.relacion).toBe('prospecto');
    expect(emp.razon_social).toBe('Empresa Nueva Desde Form SRL');
    expect(emp.cuit).toBe(cuit);
    expect(emp.rubro).toBe('Comercio');

    // FK de audit válida: la auditoría referencia la empresa recién creada.
    const [audit] = await sql<{ empresa_id: string }[]>`
      SELECT empresa_id FROM audit WHERE id = ${id}
    `;
    expect(audit.empresa_id).toBe(emp.id);
  });

  it('CAB explícita sincroniza la empresa (no la vista) vía syncClientFromCab', async () => {
    const cabItemId = await getCabItemId(sql, 'it');
    const cuit = '30-74444444-6';
    await sql`DELETE FROM empresa WHERE cuit = ${cuit}`;

    const { id } = await createAudit(
      {
        newClient: {
          razonSocial: 'Empresa Sync Original SRL',
          cuit,
          rubro: 'Servicios'
        },
        types: ['it'],
        segment: 'A',
        techByType: { it: tecnicoId },
        scheduledAt: '2026-09-01',
        cabResponses: { [cabItemId]: 'Empresa Sync Editada SRL' }
      },
      adminId
    );

    const detail = await getAuditById(id);
    // El CAB explícito prevalece y se sincroniza a la tabla base empresa.
    const [emp] = await sql<{ razon_social: string }[]>`
      SELECT razon_social FROM empresa WHERE id = ${detail!.clientId}
    `;
    expect(emp.razon_social).toBe('Empresa Sync Editada SRL');
  });
});
