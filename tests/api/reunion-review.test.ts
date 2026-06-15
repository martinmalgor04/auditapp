import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { insertTestAuditRow, getFirstTemplateItemId } from '../helpers/backoffice';
import { POST as acceptHandler } from '../../src/routes/api/audits/[auditId]/reunion/proposals/[proposalId]/accept/+server';
import { POST as rejectHandler } from '../../src/routes/api/audits/[auditId]/reunion/proposals/[proposalId]/reject/+server';
import { POST as editHandler } from '../../src/routes/api/audits/[auditId]/reunion/proposals/[proposalId]/edit/+server';
import {
  insertReunionSession,
  updateReunionSessionStatus
} from '../../src/lib/server/db/reunion-sessions';
import { insertReunionProposals } from '../../src/lib/server/db/reunion-proposals';
import type { AppUser } from '../../src/lib/server/auth/types';
import type postgres from 'postgres';

function makeLocals(user: AppUser): App.Locals {
  return { user };
}

describe('reunion review API', () => {
  let sql: postgres.Sql;
  let adminUser: AppUser;
  let auditId: string;
  let sessionId: string;
  let itemId: string;
  let proposalId: string;

  async function createProposal(overrideItemId?: string): Promise<string> {
    const targetItemId = overrideItemId ?? itemId;
    await insertReunionProposals([
      {
        reunionSessionId: sessionId,
        itemId: targetItemId,
        proposedValue: 'Valor propuesto test',
        quote: 'El cliente dijo esto en la reunión',
        confidence: 0.85
      }
    ]);

    const [row] = await sql<{ id: string }[]>`
      SELECT id FROM reunion_proposal
      WHERE reunion_session_id = ${sessionId} AND item_id = ${targetItemId}
      LIMIT 1
    `;
    if (!row) throw new Error('Proposal not found after insert');
    return row.id;
  }

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
  });

  beforeEach(async () => {
    adminUser = (await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar'))!;

    const row = await insertTestAuditRow(sql, {
      razonSocial: 'Review API Test SRL',
      status: 'en_relevamiento'
    });
    auditId = row.auditId;

    sessionId = await insertReunionSession({
      auditId,
      startedBy: adminUser.id,
      sessionType: 'visita',
      consentRecordedAt: new Date()
    });

    await updateReunionSessionStatus(sessionId, 'ready_for_review');

    itemId = await getFirstTemplateItemId(sql, 'it');
    proposalId = await createProposal();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('POST accept crea audit_response con source=reunion_ia', async () => {
    const res = await acceptHandler({
      params: { auditId, proposalId },
      locals: makeLocals(adminUser)
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.review_status).toBe('accepted');

    const [row] = await sql<{ source: string; value: unknown }[]>`
      SELECT source, value FROM audit_response
      WHERE audit_id = ${auditId} AND item_id = ${itemId}
    `;
    expect(row?.source).toBe('reunion_ia');
    expect(row?.value).not.toBeNull();
  });

  it('segunda aceptación del mismo ítem actualiza (no duplica)', async () => {
    // Primera aceptación
    await acceptHandler({
      params: { auditId, proposalId },
      locals: makeLocals(adminUser)
    } as never);

    // Segunda propuesta para el mismo ítem
    const proposalId2 = await createProposal(itemId);
    await acceptHandler({
      params: { auditId, proposalId: proposalId2 },
      locals: makeLocals(adminUser)
    } as never);

    // Solo debe haber 1 fila en audit_response para ese item
    const [row] = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM audit_response
      WHERE audit_id = ${auditId} AND item_id = ${itemId}
    `;
    expect(parseInt(row?.count ?? '0', 10)).toBe(1);
  });

  it('POST reject NO altera audit_response', async () => {
    const res = await rejectHandler({
      params: { auditId, proposalId },
      locals: makeLocals(adminUser)
    } as never);

    expect(res.status).toBe(200);

    const [row] = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM audit_response
      WHERE audit_id = ${auditId} AND item_id = ${itemId}
    `;
    expect(parseInt(row?.count ?? '0', 10)).toBe(0);
  });

  it('POST edit persiste final_value distinto en audit_response', async () => {
    const finalValue = 'Valor editado por técnico';
    const res = await editHandler({
      params: { auditId, proposalId },
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_value: finalValue })
      }),
      locals: makeLocals(adminUser)
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.review_status).toBe('edited');

    const [responseRow] = await sql<{ source: string }[]>`
      SELECT source FROM audit_response WHERE audit_id = ${auditId} AND item_id = ${itemId}
    `;
    expect(responseRow?.source).toBe('reunion_ia');

    const [proposalRow] = await sql<{ final_value: unknown }[]>`
      SELECT final_value FROM reunion_proposal WHERE id = ${proposalId}
    `;
    expect(proposalRow?.final_value).not.toBeNull();
  });

  it('tras aceptar, PATCH técnico al mismo ítem cambia source; audit.status inalterado', async () => {
    // Aceptar propuesta
    await acceptHandler({
      params: { auditId, proposalId },
      locals: makeLocals(adminUser)
    } as never);

    // Simular guardado del técnico (fuente = admin)
    await sql`
      UPDATE audit_response
      SET source = 'admin', updated_at = now()
      WHERE audit_id = ${auditId} AND item_id = ${itemId}
    `;

    // Verificar que source cambió
    const [row] = await sql<{ source: string }[]>`
      SELECT source FROM audit_response WHERE audit_id = ${auditId} AND item_id = ${itemId}
    `;
    expect(row?.source).toBe('admin');

    // audit.status no debe cambiar
    const [audit] = await sql<{ status: string }[]>`
      SELECT status FROM audit WHERE id = ${auditId}
    `;
    expect(audit?.status).toBe('en_relevamiento');
  });
});
