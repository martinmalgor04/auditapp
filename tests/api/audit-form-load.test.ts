import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { loadAuditForm } from '../../src/lib/server/form/load-form';
import { AuditFormNotAllowedError } from '../../src/lib/server/form/errors';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail } from '../helpers/auth';
import { seedAuditFormFixture } from '../fixtures/audit-form';
import type postgres from 'postgres';

describe('audit form load', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('assigned tecnico receives form data', async () => {
    const { auditId } = await seedAuditFormFixture(sql);
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const form = await loadAuditForm(auditId, tech!);
    expect(form.sections.length).toBeGreaterThan(0);
    expect(form.audit.id).toBe(auditId);
  });

  it('unassigned tecnico receives 403', async () => {
    const { auditId } = await seedAuditFormFixture(sql, {
      assignedTechEmail: 'facu@serviciosysistemas.com.ar'
    });
    const other = await findUserByEmail(sql, 'simon@serviciosysistemas.com.ar');
    await expect(loadAuditForm(auditId, other!)).rejects.toThrow(AuditFormNotAllowedError);
  });

  it('admin can load any audit form', async () => {
    const { auditId } = await seedAuditFormFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const form = await loadAuditForm(auditId, admin!);
    expect(form.audit.id).toBe(auditId);
  });
});
