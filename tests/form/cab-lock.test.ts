import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { loadAuditForm } from '../../src/lib/server/form/load-form';
import { saveFormResponse } from '../../src/lib/server/form/save-response';
import { confirmCab } from '../../src/lib/server/db/audit-form';
import { FormItemNotAllowedError } from '../../src/lib/server/form/errors';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserByEmail, findUserIdByEmail } from '../helpers/auth';
import { insertLegacyMixedAuditRow } from '../helpers/backoffice';

// #32 — CAB compartido único con bloqueo. Cubre R16, R17, R18, R19, R20.
describe('#32 form — bloqueo del CAB compartido', () => {
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
    const { auditId } = await insertLegacyMixedAuditRow(sql, {
      razonSocial: 'CAB Lock SA',
      itTechId,
      erpTechId,
      status: 'en_relevamiento',
      createdBy: adminId
    });
    return auditId;
  }

  async function getCabTextItemId(auditId: string): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      SELECT ti.id FROM audit a
      JOIN section s ON s.template_id = ANY(a.template_ids)
      JOIN template_item ti ON ti.section_id = s.id
      WHERE a.id = ${auditId} AND s.code = 'CAB'
        AND ti.filled_by IN ('tecnico', 'admin')
        AND ti.field_type = 'text'
      ORDER BY ti.sort_order LIMIT 1
    `;
    return row.id;
  }

  async function getItSectionItemId(auditId: string): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      SELECT ti.id FROM audit a
      JOIN section s ON s.template_id = ANY(a.template_ids)
      JOIN template t ON t.id = s.template_id
      JOIN template_item ti ON ti.section_id = s.id
      WHERE a.id = ${auditId} AND t.code = 'it' AND s.code <> 'CAB'
        AND ti.filled_by = 'tecnico' AND ti.field_type = 'tri'
      ORDER BY s.sort_order, ti.sort_order LIMIT 1
    `;
    return row.id;
  }

  it('(R16, R17) primer técnico edita y confirma el CAB (set atómico)', async () => {
    const auditId = await createMixedAudit();
    const itTech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const cabItem = await getCabTextItemId(auditId);

    // No confirmado → canConfirm true, no locked.
    let form = await loadAuditForm(auditId, itTech!);
    expect(form.cab.confirmed).toBe(false);
    expect(form.cab.canConfirm).toBe(true);
    expect(form.cab.locked).toBe(false);

    // Edita el CAB.
    await expect(
      saveFormResponse(auditId, itTech!, { itemId: cabItem, value: 'Razón confirmada SA' })
    ).resolves.toBeTruthy();

    // Confirma (atómico, idempotente).
    expect(await confirmCab(auditId, itTechId)).toBe(true);
    // Segunda confirmación → no-op.
    expect(await confirmCab(auditId, erpTechId)).toBe(false);

    const [a] = await sql<{ cab_confirmed_by: string; cab_confirmed_at: Date | null }[]>`
      SELECT cab_confirmed_by, cab_confirmed_at FROM audit WHERE id = ${auditId}
    `;
    expect(a.cab_confirmed_by).toBe(itTechId);
    expect(a.cab_confirmed_at).not.toBeNull();

    // El confirmador puede reeditar el CAB (R18).
    form = await loadAuditForm(auditId, itTech!);
    expect(form.cab.locked).toBe(false);
    await expect(
      saveFormResponse(auditId, itTech!, { itemId: cabItem, value: 'Reeditada por confirmador' })
    ).resolves.toBeTruthy();
  });

  it('(R18, R19, R20) confirmado por A: B ve solo-lectura, su edición del CAB se rechaza, su área sigue editable', async () => {
    const auditId = await createMixedAudit();
    const itTech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar'); // A (confirmador)
    const erpTech = await findUserByEmail(sql, 'simon@serviciosysistemas.com.ar'); // B
    const cabItem = await getCabTextItemId(auditId);

    await saveFormResponse(auditId, itTech!, { itemId: cabItem, value: 'Valor confirmado' });
    await confirmCab(auditId, itTechId);

    // R19: B ve el CAB confirmado en solo-lectura, sin acción de confirmar.
    const formB = await loadAuditForm(auditId, erpTech!);
    expect(formB.cab.confirmed).toBe(true);
    expect(formB.cab.locked).toBe(true);
    expect(formB.cab.canConfirm).toBe(false);
    expect(formB.cab.confirmedBy).toBe(itTechId);

    // R18: edición del CAB por B (≠A, ≠admin) se rechaza, sin escribir.
    await expect(
      saveFormResponse(auditId, erpTech!, { itemId: cabItem, value: 'Intento de B' })
    ).rejects.toThrow(FormItemNotAllowedError);

    const [resp] = await sql<{ value: unknown }[]>`
      SELECT value FROM audit_response WHERE audit_id = ${auditId} AND item_id = ${cabItem}
    `;
    expect(resp.value).toBe('Valor confirmado');

    // R20: B sigue pudiendo editar su sección de área (ERP).
    const erpItem = await sql<{ id: string }[]>`
      SELECT ti.id FROM audit a
      JOIN section s ON s.template_id = ANY(a.template_ids)
      JOIN template t ON t.id = s.template_id
      JOIN template_item ti ON ti.section_id = s.id
      WHERE a.id = ${auditId} AND t.code = 'erp-tango' AND s.code <> 'CAB'
        AND ti.filled_by = 'tecnico' AND ti.field_type = 'tri'
      ORDER BY s.sort_order, ti.sort_order LIMIT 1
    `;
    await expect(
      saveFormResponse(auditId, erpTech!, { itemId: erpItem[0].id, value: 'si' })
    ).resolves.toBeTruthy();
  });

  it('(R20) confirmado: A (confirmador) sigue editando su área IT', async () => {
    const auditId = await createMixedAudit();
    const itTech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const cabItem = await getCabTextItemId(auditId);
    const itItem = await getItSectionItemId(auditId);

    await saveFormResponse(auditId, itTech!, { itemId: cabItem, value: 'X' });
    await confirmCab(auditId, itTechId);

    await expect(
      saveFormResponse(auditId, itTech!, { itemId: itItem, value: 'si' })
    ).resolves.toBeTruthy();
  });
});
