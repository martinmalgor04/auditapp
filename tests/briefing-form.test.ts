import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { computeStepCount, loadBriefingForm } from '../src/lib/server/briefing/load-form';
import { validateBriefingToken } from '../src/lib/server/briefing/validate-token';
import { load as briefingLoad } from '../src/routes/briefing/[token]/+page.server';
import { setupTestDb, teardownTestDb } from './helpers/db';
import {
  BRIEFING_FIXTURE_TOKEN,
  listClienteItemIds,
  seedBriefingAuditFixture
} from './fixtures/briefing-audit';
import { getTemplateIdByCode } from './helpers/backoffice';
import type postgres from 'postgres';

describe('briefing form load', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('includes only cliente items from template', async () => {
    const { auditId } = await seedBriefingAuditFixture(sql);
    const ctx = await validateBriefingToken(BRIEFING_FIXTURE_TOKEN);
    const form = await loadBriefingForm(ctx);

    const clienteIds = await listClienteItemIds(sql, auditId);
    expect(form.items.map((i) => i.id).sort()).toEqual(clienteIds.sort());
    expect(form.items.every((i) => !i.label.toLowerCase().includes('score'))).toBe(true);

    const [tecnicoCount] = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count
      FROM template_item ti
      JOIN section s ON s.id = ti.section_id
      WHERE s.template_id = ${await getTemplateIdByCode(sql, 'it')}
        AND ti.filled_by = 'tecnico'
    `;
    expect(Number(tecnicoCount.count)).toBeGreaterThan(0);
    expect(form.items.length).toBeLessThan(Number(tecnicoCount.count) + form.items.length);
  });

  it('page load exposes razon_social in header data', async () => {
    await seedBriefingAuditFixture(sql, { razonSocial: 'Acme NEA SRL' });
    const data = (await briefingLoad({
      params: { token: BRIEFING_FIXTURE_TOKEN },
      locals: { user: null }
    } as never)) as
      | { available: true; client: { razonSocial: string } }
      | { available: false; message: string };

    expect(data.available).toBe(true);
    if (data.available) {
      expect(data.client.razonSocial).toBe('Acme NEA SRL');
    }
  });

  it('uses single page for 7 cliente items (seed it template)', async () => {
    await seedBriefingAuditFixture(sql);
    const ctx = await validateBriefingToken(BRIEFING_FIXTURE_TOKEN);
    const form = await loadBriefingForm(ctx);
    expect(form.items.length).toBe(7);
    expect(form.stepCount).toBe(1);
    expect(computeStepCount(5)).toBe(1);
  });

  it('uses wizard steps when more than 8 items', () => {
    expect(computeStepCount(10)).toBe(2);
    expect(computeStepCount(13)).toBe(3);
  });
});
