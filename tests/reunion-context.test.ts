import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { insertTestAuditRow } from './helpers/backoffice';
import { buildTemplateContextForExtraction } from '../src/lib/server/reunion/pipeline/context';
import { REUNION_EXTRACTABLE_FIELD_TYPES } from '../src/lib/server/reunion/pipeline/context';
import type postgres from 'postgres';

// R11 — el contexto enriquecido debe incluir help_text + section_title por ítem,
// sin alterar el filtro de field_type MVP / filled_by.
describe('buildTemplateContextForExtraction — contexto enriquecido (R11)', () => {
  let sql: postgres.Sql;
  let auditId: string;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
  });

  beforeEach(async () => {
    const { auditId: aid } = await insertTestAuditRow(sql, {
      razonSocial: 'Test Contexto SA',
      types: ['it'],
      status: 'en_relevamiento'
    });
    auditId = aid;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('cada ítem expone section_title (string no vacío) y la propiedad help_text', async () => {
    const ctx = await buildTemplateContextForExtraction(auditId);
    expect(ctx.items.length).toBeGreaterThan(0);

    for (const item of ctx.items) {
      expect(typeof item.section_title).toBe('string');
      expect(item.section_title.length).toBeGreaterThan(0);
      // help_text es nullable, pero la propiedad debe existir (string | null)
      expect('help_text' in item).toBe(true);
      expect(item.help_text === null || typeof item.help_text === 'string').toBe(true);
    }
  });

  it('el help_text del template_item se surfacea (no queda hardcodeado en null)', async () => {
    // Sembramos help_text en un ítem elegible y verificamos que el contexto lo trae.
    const ctxBefore = await buildTemplateContextForExtraction(auditId);
    const target = ctxBefore.items[0];
    expect(target).toBeDefined();
    await sql`
      UPDATE template_item
      SET help_text = ${'Ayuda de prueba para extracción'}
      WHERE id = ${target.item_id}
    `;
    try {
      const ctxAfter = await buildTemplateContextForExtraction(auditId);
      const updated = ctxAfter.items.find((i) => i.item_id === target.item_id);
      expect(updated?.help_text).toBe('Ayuda de prueba para extracción');
    } finally {
      await sql`UPDATE template_item SET help_text = ${target.help_text} WHERE id = ${target.item_id}`;
    }
  });

  it('el filtro field_type MVP / filled_by no cambia', async () => {
    const ctx = await buildTemplateContextForExtraction(auditId);
    for (const item of ctx.items) {
      expect(REUNION_EXTRACTABLE_FIELD_TYPES.has(item.field_type)).toBe(true);
      expect(['cliente', 'tecnico']).toContain(item.filled_by);
    }
  });
});
