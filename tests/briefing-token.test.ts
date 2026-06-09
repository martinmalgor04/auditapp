import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AUDIT_STATUSES } from '../src/lib/server/db/audit-status';
import { BriefingUnavailableError } from '../src/lib/server/briefing/errors';
import {
  isTokenExpired,
  validateBriefingToken
} from '../src/lib/server/briefing/validate-token';
import { isBriefingStatusValid } from '../src/lib/server/auth/briefing-token';
import { setupTestDb, teardownTestDb, truncateSeedTables } from './helpers/db';
import { runSeed } from '../src/lib/server/db/seed';
import { insertTestAuditRow } from './helpers/backoffice';
import type postgres from 'postgres';

describe('briefing token validation', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    await truncateSeedTables(sql);
    await runSeed(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('token never expires without token_expires_at column', () => {
    expect(isTokenExpired(null)).toBe(false);
  });

  it.each(['briefing_enviado', 'briefing_completo'] as const)(
    'allows status %s',
    async (status) => {
      const token = `valid-${status}`;
      await insertTestAuditRow(sql, {
        razonSocial: 'Token OK',
        status,
        publicToken: token
      });
      const ctx = await validateBriefingToken(token);
      expect(ctx.audit.status).toBe(status);
    }
  );

  it.each(['borrador', 'en_relevamiento', 'en_cierre', 'cerrada'] as const)(
    'rejects status %s',
    async (status) => {
      const token = `invalid-${status}`;
      await insertTestAuditRow(sql, {
        razonSocial: 'Token Bad',
        status,
        publicToken: token
      });
      await expect(validateBriefingToken(token)).rejects.toThrow(BriefingUnavailableError);
    }
  );

  it('rejects unknown token', async () => {
    await expect(validateBriefingToken('no-such-token')).rejects.toThrow(
      BriefingUnavailableError
    );
  });

  it('covers full status matrix', () => {
    for (const status of AUDIT_STATUSES) {
      expect(isBriefingStatusValid(status)).toBe(
        status === 'briefing_enviado' || status === 'briefing_completo'
      );
    }
  });
});
