import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { createAudit } from '../../src/lib/server/backoffice/audits';
import { loadAuditForm } from '../../src/lib/server/form/load-form';
import { AuditFormNotAllowedError } from '../../src/lib/server/form/errors';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail, findUserIdByEmail } from '../helpers/auth';

// #32 — filtrado de secciones por especialidad asignada. Cubre R11–R15.
describe('#32 form — filtrado de secciones por área asignada', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let itTechId: string;
  let erpTechId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    setSqlForTests(sql);
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    itTechId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
    erpTechId = await findUserIdByEmail(sql, 'simon@serviciosysistemas.com.ar');
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function createMixedAudit(): Promise<string> {
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, relacion) VALUES ('Mixta Form SA', 'cliente') RETURNING id
    `;
    const { id } = await createAudit(
      {
        clientId: c.id,
        types: ['it', 'erp-tango'],
        segment: 'B',
        techByType: { it: itTechId, 'erp-tango': erpTechId },
        scheduledAt: '2026-07-01',
        cabResponses: {}
      },
      adminId
    );
    // El form solo es editable en estos estados.
    await sql`UPDATE audit SET status = 'en_relevamiento' WHERE id = ${id}`;
    return id;
  }

  it('(R11, R12, R15) técnico IT en mixta → CAB + secciones IT, sin secciones ERP', async () => {
    const auditId = await createMixedAudit();
    const itTech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const form = await loadAuditForm(auditId, itTech!);

    const codes = form.sections.map((s) => s.code);
    // R15: el CAB aparece una sola vez.
    expect(codes.filter((c) => c === 'CAB').length).toBe(1);

    // Las secciones visibles pertenecen al template IT (o son el CAB).
    const itTemplateSections = await sql<{ code: string }[]>`
      SELECT s.code FROM section s
      JOIN template t ON t.id = s.template_id
      WHERE t.code = 'it' AND t.status = 'active'
    `;
    const itCodes = new Set(itTemplateSections.map((r) => r.code));
    for (const code of codes) {
      expect(itCodes.has(code)).toBe(true);
    }

    // R12: ninguna sección ERP-exclusiva (presente en erp-tango pero no en it).
    const erpOnly = await sql<{ code: string }[]>`
      SELECT s.code FROM section s
      JOIN template t ON t.id = s.template_id
      WHERE t.code = 'erp-tango' AND t.status = 'active'
        AND s.code <> 'CAB'
        AND s.code NOT IN (
          SELECT s2.code FROM section s2
          JOIN template t2 ON t2.id = s2.template_id
          WHERE t2.code = 'it' AND t2.status = 'active'
        )
    `;
    const erpOnlyCodes = new Set(erpOnly.map((r) => r.code));
    for (const code of codes) {
      expect(erpOnlyCodes.has(code)).toBe(false);
    }
  });

  it('(R13) admin en mixta → todas las secciones de todos los tipos', async () => {
    const auditId = await createMixedAudit();
    const admin = await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar');
    const itTech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');

    const adminForm = await loadAuditForm(auditId, admin!);
    const itForm = await loadAuditForm(auditId, itTech!);

    // El admin ve estrictamente más (o igual) secciones que el técnico IT,
    // y al menos una sección que el técnico IT no ve (las ERP).
    expect(adminForm.sections.length).toBeGreaterThan(itForm.sections.length);
    // CAB sigue único para el admin.
    expect(adminForm.sections.filter((s) => s.code === 'CAB').length).toBe(1);
  });

  it('(R14) técnico sin asignación en la auditoría → 403 en loadAuditForm', async () => {
    // Auditoría IT pura asignada a facu; simon (ERP) no está asignado.
    const [c] = await sql<{ id: string }[]>`
      INSERT INTO empresa (razon_social, relacion) VALUES ('IT Pura SA', 'cliente') RETURNING id
    `;
    const { id } = await createAudit(
      {
        clientId: c.id,
        types: ['it'],
        segment: 'A',
        techByType: { it: itTechId },
        scheduledAt: '2026-07-01',
        cabResponses: {}
      },
      adminId
    );
    await sql`UPDATE audit SET status = 'en_relevamiento' WHERE id = ${id}`;

    const erpTech = await findUserByEmail(sql, 'simon@serviciosysistemas.com.ar');
    await expect(loadAuditForm(id, erpTech!)).rejects.toThrow(AuditFormNotAllowedError);
  });
});
