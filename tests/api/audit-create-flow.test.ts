import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import {
  createAudit,
  getAuditById,
  searchClientsForPicker
} from '../../src/lib/server/backoffice/audits';
import { actions as newAuditActions } from '../../src/routes/(app)/auditorias/new/+page.server';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';
import { getCabItemId } from '../helpers/backoffice';
import type postgres from 'postgres';

describe('nueva auditoría — scope completo', () => {
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

  it('cliente existente: búsqueda server-side, CAB desde client y borrador', async () => {
    expect(await searchClientsForPicker('p')).toEqual([]);

    const byName = await searchClientsForPicker('plastipress');
    expect(byName.some((r) => r.razonSocial.toUpperCase().includes('PLASTIPRESS'))).toBe(true);

    const byCuit = await searchClientsForPicker('30518766925');
    const picked = byCuit.find((r) => r.cuit === '30518766925');
    expect(picked).toBeTruthy();
    expect(picked!.cabFields.razonSocial.toUpperCase()).toContain('PLASTIPRESS');

    const fd = new FormData();
    fd.set('q', 'plastipress');
    const actionResult = await newAuditActions.searchClients({
      locals: {
        user: {
          id: adminId,
          email: 'admin@serviciosysistemas.com.ar',
          name: 'Admin',
          role: 'admin',
          active: true,
          auditTypes: null
        }
      },
      request: new Request('http://localhost/auditorias/new', {
        method: 'POST',
        body: fd
      })
    } as never);
    expect(actionResult).toMatchObject({
      clients: expect.arrayContaining([
        expect.objectContaining({ razonSocial: expect.stringMatching(/plastipress/i) })
      ])
    });

    const { id } = await createAudit(
      {
        clientId: picked!.id,
        types: ['it'],
        segment: 'B',
        techByType: { it: tecnicoId },
        scheduledAt: '2026-07-01',
        cabResponses: {}
      },
      adminId
    );

    const audit = await getAuditById(id);
    expect(audit?.status).toBe('borrador');

    const byLabel = new Map(audit!.cabItems.map((item) => [item.label, item.value]));
    expect(byLabel.get('Razón social')).toBe(picked!.cabFields.razonSocial);
    expect(byLabel.get('CUIT')).toBe(picked!.cabFields.cuit);
    expect(byLabel.get('Fecha programada de visita')).toBe('2026-07-01');

    const [responseCount] = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM audit_response
      WHERE audit_id = ${id}
    `;
    expect(Number(responseCount.count)).toBeGreaterThan(0);
  });

  it('cliente nuevo: alta, CAB explícita prevalece y sync a client', async () => {
    const cabItemId = await getCabItemId(sql, 'it');

    const { id } = await createAudit(
      {
        newClient: {
          razonSocial: 'Nuevo Cliente SRL',
          cuit: '30-12345678-9',
          rubro: 'Comercio'
        },
        types: ['it'],
        segment: 'A',
        techByType: { it: tecnicoId },
        scheduledAt: '2026-08-01',
        cabResponses: { [cabItemId]: 'Nombre CAB distinto SRL' }
      },
      adminId
    );

    const audit = await getAuditById(id);
    const razonCab = audit!.cabItems.find((i) => i.label === 'Razón social')?.value;
    expect(razonCab).toBe('Nombre CAB distinto SRL');

    const [client] = await sql<{ razon_social: string; cuit: string; rubro: string }[]>`
      SELECT razon_social, cuit, rubro FROM client WHERE id = ${audit!.clientId}
    `;
    expect(client.razon_social).toBe('Nombre CAB distinto SRL');
    expect(client.cuit).toBe('30-12345678-9');
    expect(client.rubro).toBe('Comercio');
  });
});
