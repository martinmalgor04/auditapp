import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { setSqlForTests } from '../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserIdByEmail } from './helpers/auth';
import {
  canTransition,
  assertTransition,
  pathTo,
  CRM_FUNNEL
} from '../src/lib/server/crm/state-machine';
import { CrmInvalidTransitionError } from '../src/lib/server/crm/errors';
import { changeStatus, linkAudit, listLeadEvents } from '../src/lib/server/db/crm-leads';

describe('crm state machine — pure', () => {
  it('allows sequential funnel transitions (R2)', () => {
    for (let i = 0; i < CRM_FUNNEL.length - 1; i++) {
      expect(canTransition(CRM_FUNNEL[i], CRM_FUNNEL[i + 1])).toBe(true);
    }
  });

  it('allows discard from any active state and reactivation (R2)', () => {
    for (const s of CRM_FUNNEL) {
      expect(canTransition(s, 'descartado')).toBe(true);
    }
    expect(canTransition('descartado', 'lead')).toBe(true);
  });

  it('rejects invalid transitions with CRM_INVALID_TRANSITION (R2)', () => {
    const invalid: [string, string][] = [
      ['lead', 'agendo'],
      ['cliente', 'lead'],
      ['auditado', 'contactado'],
      ['descartado', 'cliente']
    ];
    for (const [from, to] of invalid) {
      expect(() => assertTransition(from as never, to as never)).toThrow(CrmInvalidTransitionError);
      try {
        assertTransition(from as never, to as never);
      } catch (e) {
        expect((e as CrmInvalidTransitionError).code).toBe('CRM_INVALID_TRANSITION');
      }
    }
  });

  it('pathTo returns intermediate steps (R3)', () => {
    expect(pathTo('contactado', 'auditado')).toEqual(['agendo', 'auditado']);
    expect(pathTo('presupuestado', 'auditado')).toEqual([]);
    expect(pathTo('lead', 'contactado')).toEqual(['contactado']);
  });
});

describe('crm state machine — DB', () => {
  let sql: postgres.Sql;
  let adminId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function insertLead(status: string, email?: string) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO crm_lead (email, empresa, source, status)
      VALUES (${email ?? `lead-${randomUUID()}@test.com`}, 'Empresa Test', 'manual', ${status})
      RETURNING id
    `;
    return row.id;
  }

  async function insertAudit() {
    const [client] = await sql<{ id: string }[]>`
      INSERT INTO client (razon_social) VALUES ('Cliente CRM') RETURNING id
    `;
    const [audit] = await sql<{ id: string }[]>`
      INSERT INTO audit (client_id, name, types, template_ids, segment, status, public_token)
      VALUES (${client.id}, 'Audit CRM', ARRAY['it']::text[], ARRAY[]::uuid[], 'A', 'borrador', ${randomUUID()})
      RETURNING id
    `;
    return audit.id;
  }

  it('linkAudit advances contactado → auditado with events (R3)', async () => {
    const leadId = await insertLead('contactado');
    const auditId = await insertAudit();
    const lead = await linkAudit(leadId, auditId, adminId);
    expect(lead.status).toBe('auditado');
    expect(lead.auditId).toBe(auditId);
    const events = await listLeadEvents(leadId);
    expect(events.map((e: { fromStatus: string; toStatus: string }) => `${e.fromStatus}→${e.toStatus}`)).toEqual([
      'contactado→agendo',
      'agendo→auditado'
    ]);
  });

  it('linkAudit on presupuestado keeps status (R3)', async () => {
    const leadId = await insertLead('presupuestado');
    const auditId = await insertAudit();
    const lead = await linkAudit(leadId, auditId, adminId);
    expect(lead.status).toBe('presupuestado');
    expect(lead.auditId).toBe(auditId);
    expect(await listLeadEvents(leadId)).toHaveLength(0);
  });

  it('invalid transition does not insert event (R8)', async () => {
    const leadId = await insertLead('lead');
    const eventsBefore = await listLeadEvents(leadId);
    await expect(changeStatus(leadId, 'cliente', adminId)).rejects.toThrow(CrmInvalidTransitionError);
    expect(await listLeadEvents(leadId)).toEqual(eventsBefore);
  });
});
