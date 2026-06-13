import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { setSqlForTests } from '../../src/lib/server/db/client';
import {
  insertActiveProposalLink,
  insertErrorProposalLink
} from '../../src/lib/server/db/psys-links';
import { PSYS_CONTRACT_VERSION } from '../../src/lib/server/psys/schemas';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedApprovedReportFixture } from '../fixtures/psys-proposal';
import { buildValidInternalDraft, loadInformeCanonicalGolden } from '../fixtures/informe-claude-mock';
import { buildPsysPayload } from '../../src/lib/server/psys/payload';

describe('audit_proposal_link schema', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function buildPayload(auditId: string, reportId: string) {
    const [row] = await sql<{ version: number }[]>`
      SELECT version FROM audit_report WHERE id = ${reportId}
    `;
    const golden = loadInformeCanonicalGolden();
    return buildPsysPayload({
      auditId,
      report: {
        id: reportId,
        auditId,
        version: row.version,
        status: 'aprobado',
        canonicalJson: golden,
        schemaVersion: golden.schema_version,
        clientDraft: null,
        internalDraft: buildValidInternalDraft(),
        promptVersion: null,
        model: null,
        errorMessage: null,
        loomUrl: null,
        requestedBy: (await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar'))!.id,
        editedBy: null,
        editedAt: null,
        approvedBy: null,
        approvedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      canonical: golden
    });
  }

  it('doble insert activo viola UNIQUE parcial (R6, R16)', async () => {
    setSqlForTests(sql);
    const fixture = await seedApprovedReportFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const payload = await buildPayload(fixture.auditId, fixture.reportId);
    const proposalA = randomUUID();
    const proposalB = randomUUID();

    await insertActiveProposalLink({
      auditId: fixture.auditId,
      reportId: fixture.reportId,
      proposalId: proposalA,
      numberDisplay: '111',
      proposalUrl: 'https://presupuestos.serviciosysistemas.com.ar/presupuestos/a',
      psysStatus: 'borrador',
      contractVersion: PSYS_CONTRACT_VERSION,
      sentPayload: payload,
      createdBy: admin!.id
    });

    await expect(
      insertActiveProposalLink({
        auditId: fixture.auditId,
        reportId: fixture.reportId,
        proposalId: proposalB,
        numberDisplay: '222',
        proposalUrl: 'https://presupuestos.serviciosysistemas.com.ar/presupuestos/b',
        psysStatus: 'borrador',
        contractVersion: PSYS_CONTRACT_VERSION,
        sentPayload: payload,
        createdBy: admin!.id
      })
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('fila error exige error_message (R7, R8)', async () => {
    setSqlForTests(sql);
    const fixture = await seedApprovedReportFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const payload = await buildPayload(fixture.auditId, fixture.reportId);

    await expect(
      sql`
        INSERT INTO audit_proposal_link (
          audit_id, report_id, status, contract_version, sent_payload, created_by
        )
        VALUES (
          ${fixture.auditId}, ${fixture.reportId}, 'error', ${PSYS_CONTRACT_VERSION},
          ${sql.json(payload as never)}, ${admin!.id}
        )
      `
    ).rejects.toBeTruthy();

    const errorRow = await insertErrorProposalLink({
      auditId: fixture.auditId,
      reportId: fixture.reportId,
      contractVersion: PSYS_CONTRACT_VERSION,
      sentPayload: payload,
      errorMessage: 'falló remoto',
      createdBy: admin!.id
    });
    expect(errorRow.status).toBe('error');
    expect(errorRow.errorMessage).toBe('falló remoto');
    expect(errorRow.proposalId).toBeNull();
  });
});
