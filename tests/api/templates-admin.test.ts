import { error } from '@sveltejs/kit';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getTemplateById, updateTemplateItem } from '../../src/lib/server/backoffice/templates';
import {
  load as templateLoad,
  actions as templateActions
} from '../../src/routes/(app)/plantillas/[id]/+page.server';
import { setupTestDb, teardownTestDb } from '../helpers/db';
import { findUserIdByEmail } from '../helpers/auth';
import { getFirstTemplateItemId, getTemplateIdByCode } from '../helpers/backoffice';
import type postgres from 'postgres';

describe('templates admin', () => {
  let sql: postgres.Sql;
  let adminId: string;
  let tecnicoId: string;
  let templateId: string;

  const adminUser = () => ({
    id: adminId,
    email: 'admin@serviciosysistemas.com.ar',
    name: 'Admin',
    role: 'admin' as const,
    active: true
  });

  const tecnicoUser = () => ({
    id: tecnicoId,
    email: 'facu@serviciosysistemas.com.ar',
    name: 'Facu',
    role: 'tecnico' as const,
    active: true
  });

  beforeAll(async () => {
    sql = await setupTestDb();
  });

  beforeEach(async () => {
    adminId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');
    tecnicoId = await findUserIdByEmail(sql, 'facu@serviciosysistemas.com.ar');
    templateId = await getTemplateIdByCode(sql, 'it');
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('admin can load template editor', async () => {
    const data = (await templateLoad({
      locals: { user: adminUser() },
      params: { id: templateId }
    } as never)) as { template: { id: string; sections: unknown[] } };

    expect(data.template.id).toBe(templateId);
    expect(data.template.sections.length).toBeGreaterThan(0);
  });

  it('update allowed fields persists; rejects new item or section', async () => {
    const itemId = await getFirstTemplateItemId(sql, 'it');

    await updateTemplateItem({
      itemId,
      label: 'Label actualizado',
      help: 'Ayuda nueva',
      options: {},
      method: ['O', 'E'],
      filled_by: 'tecnico'
    });

    const [row] = await sql<{ label: string; help_text: string; filled_by: string }[]>`
      SELECT label, help_text, filled_by FROM template_item WHERE id = ${itemId}
    `;
    expect(row.label).toBe('Label actualizado');
    expect(row.help_text).toBe('Ayuda nueva');
    expect(row.filled_by).toBe('tecnico');

    const sectionResult = await templateActions.createSection({
      locals: { user: adminUser() },
      request: new Request('http://localhost', { method: 'POST' })
    } as never);
    expect(sectionResult).toMatchObject({ status: 404 });

    const itemResult = await templateActions.createItem({
      locals: { user: adminUser() },
      request: new Request('http://localhost', { method: 'POST' })
    } as never);
    expect(itemResult).toMatchObject({ status: 404 });
  });

  it('tecnico GET /plantillas/[id] returns 403', async () => {
    try {
      await templateLoad({
        locals: { user: tecnicoUser() },
        params: { id: templateId }
      } as never);
      expect.fail('should throw 403');
    } catch (e) {
      expect((e as { status: number }).status).toBe(403);
    }
  });
});
