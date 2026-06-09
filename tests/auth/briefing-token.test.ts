import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BRIEFING_UNAVAILABLE_MESSAGE,
  isBriefingStatusValid,
  resolveBriefingByToken
} from '../../src/lib/server/auth/briefing-token';
import { load as briefingLoad } from '../../src/routes/briefing/[token]/+page.server';
import { AUDIT_STATUSES } from '../../src/lib/server/db/audit-status';
import { setupTestDb, teardownTestDb, truncateSeedTables } from '../helpers/db';
import { insertTestAudit } from '../helpers/auth';
import type postgres from 'postgres';

describe('briefing public token', () => {
  let sql: postgres.Sql;
  const validToken = 'test-briefing-token-valid';
  const closedToken = 'test-briefing-token-closed';

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    await truncateSeedTables(sql);
    await insertTestAudit(sql, { status: 'briefing_enviado', publicToken: validToken });
    await insertTestAudit(sql, { status: 'cerrada', publicToken: closedToken });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('validates briefing statuses correctly', () => {
    expect(isBriefingStatusValid('briefing_enviado')).toBe(true);
    expect(isBriefingStatusValid('briefing_completo')).toBe(true);
    expect(isBriefingStatusValid('en_relevamiento')).toBe(false);
    expect(isBriefingStatusValid('cerrada')).toBe(false);
  });

  it('resolves audit by exact public token match', async () => {
    const result = await resolveBriefingByToken(validToken);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audit.publicToken).toBe(validToken);
      expect(result.audit.status).toBe('briefing_enviado');
    }
  });

  it('returns not_found for unknown token', async () => {
    const result = await resolveBriefingByToken('does-not-exist');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('rejects token when audit advanced past briefing', async () => {
    const result = await resolveBriefingByToken(closedToken);
    expect(result).toEqual({ ok: false, reason: 'invalid_status' });
  });

  it.each(['briefing_enviado', 'briefing_completo'] as const)(
    'allows access for status %s',
    async (status) => {
      const token = `token-${status}`;
      await insertTestAudit(sql, { status, publicToken: token });
      const result = await resolveBriefingByToken(token);
      expect(result.ok).toBe(true);
    }
  );

  it.each(['borrador', 'en_relevamiento', 'en_cierre', 'cerrada'] as const)(
    'denies access for status %s',
    async (status) => {
      const token = `token-deny-${status}`;
      await insertTestAudit(sql, { status, publicToken: token });
      const result = await resolveBriefingByToken(token);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(['not_found', 'invalid_status']).toContain(result.reason);
        if (status !== 'borrador' || result.reason === 'invalid_status') {
          expect(result.reason).toBe('invalid_status');
        }
      }
    }
  );

  it('briefing page load works without session cookie', async () => {
    const data = (await briefingLoad({
      params: { token: validToken },
      locals: { user: null },
      cookies: { get: () => undefined } as never
    } as never)) as
      | { available: true; audit: { publicToken: string } }
      | { available: false; message: string };

    expect(data.available).toBe(true);
    if (data.available) {
      expect(data.audit.publicToken).toBe(validToken);
    }
  });

  it('briefing page shows unavailable message for invalid token', async () => {
    const data = (await briefingLoad({
      params: { token: closedToken },
      locals: { user: null }
    } as never)) as
      | { available: true; audit: { publicToken: string } }
      | { available: false; message: string };

    expect(data.available).toBe(false);
    if (!data.available) {
      expect(data.message).toBe(BRIEFING_UNAVAILABLE_MESSAGE);
    }
  });

  it('covers all audit statuses in validation matrix', () => {
    for (const status of AUDIT_STATUSES) {
      const valid = isBriefingStatusValid(status);
      if (status === 'briefing_enviado' || status === 'briefing_completo') {
        expect(valid).toBe(true);
      } else {
        expect(valid).toBe(false);
      }
    }
  });
});
