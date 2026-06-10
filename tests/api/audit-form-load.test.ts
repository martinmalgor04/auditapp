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

  it('sections follow template sort_order (CAB first)', async () => {
    const { auditId } = await seedAuditFormFixture(sql);
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const form = await loadAuditForm(auditId, tech!);
    const sortOrders = form.sections.map((s) => s.sortOrder);
    expect(sortOrders).toEqual([...sortOrders].sort((a, b) => a - b));
    expect(form.sections[0]?.code).toBe('CAB');
  });

  it('tecnico ERP cannot load IT-only audit form', async () => {
    const { auditId } = await seedAuditFormFixture(sql, {
      assignedTechEmail: 'facu@serviciosysistemas.com.ar'
    });
    const erpTech = await findUserByEmail(sql, 'simon@serviciosysistemas.com.ar');
    await expect(loadAuditForm(auditId, erpTech!)).rejects.toThrow(AuditFormNotAllowedError);
  });

  it('tecnico with matching specialty can load audit form', async () => {
    const { auditId } = await seedAuditFormFixture(sql, {
      assignedTechEmail: 'facu@serviciosysistemas.com.ar'
    });
    const itTech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const form = await loadAuditForm(auditId, itTech!);
    expect(form.audit.id).toBe(auditId);
  });

  it('admin can load any audit form', async () => {
    const { auditId } = await seedAuditFormFixture(sql);
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const form = await loadAuditForm(auditId, admin!);
    expect(form.audit.id).toBe(auditId);
  });
});
