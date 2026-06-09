import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  generateBriefingLink,
  regenerateBriefingLink
} from '../../src/lib/server/backoffice/briefing-link';
import { findAuditByPublicToken } from '../../src/lib/server/db/audits';
import { InvalidStateTransitionError } from '../../src/lib/server/backoffice/errors';
import { actions as tableroActions } from '../../src/routes/(app)/tablero/+page.server';
import { setupTestDb, teardownTestDb, truncateSeedTables } from '../helpers/db';
import { runSeed } from '../../src/lib/server/db/seed';
import { findUserIdByEmail } from '../helpers/auth';
import { insertTestAuditRow } from '../helpers/backoffice';
import type postgres from 'postgres';

describe('audit briefing link', () => {
  let sql: postgres.Sql;
  let adminId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    await truncateSeedTables(sql);
    await runSeed(sql);
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('generate token transitions to briefing_enviado', async () => {
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: 'Briefing Test',
      status: 'borrador'
    });

    const result = await generateBriefingLink(auditId);

    expect(result.token).toBeTruthy();
    expect(result.url).toContain(`/briefing/${result.token}`);

    const [audit] = await sql<{ status: string; public_token: string }[]>`
      SELECT status, public_token FROM audit WHERE id = ${auditId}
    `;
    expect(audit.status).toBe('briefing_enviado');
    expect(audit.public_token).toBe(result.token);
  });

  it('regenerate invalidates previous token', async () => {
    const oldToken = 'old-token-test-value';
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: 'Regen Test',
      status: 'briefing_enviado',
      publicToken: oldToken
    });

    const result = await regenerateBriefingLink(auditId);

    expect(result.token).not.toBe(oldToken);

    const stale = await findAuditByPublicToken(oldToken);
    expect(stale).toBeNull();

    const current = await findAuditByPublicToken(result.token);
    expect(current?.id).toBe(auditId);
  });

  it('generate rejects non-borrador state', async () => {
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: 'Ya enviado',
      status: 'briefing_enviado'
    });

    await expect(generateBriefingLink(auditId)).rejects.toThrow(InvalidStateTransitionError);
  });

  it('copy briefing URL action returns URL when token exists', async () => {
    const token = 'copy-test-token-abc';
    await insertTestAuditRow(sql, {
      razonSocial: 'Copy Test',
      status: 'briefing_enviado',
      publicToken: token
    });

    const formData = new FormData();
    formData.set('publicToken', token);

    const adminUser = {
      id: adminId,
      email: 'admin@serviciosysistemas.com.ar',
      name: 'Admin',
      role: 'admin' as const,
      active: true
    };

    const result = await tableroActions.copyBriefingLink({
      request: new Request('http://localhost/tablero', { method: 'POST', body: formData }),
      locals: { user: adminUser }
    } as never);

    expect(result).toMatchObject({
      success: true,
      url: expect.stringContaining(`/briefing/${token}`)
    });
  });
});
