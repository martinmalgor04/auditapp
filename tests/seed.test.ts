import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSeed } from '../src/lib/server/db/seed';
import { setSqlForTests } from '../src/lib/server/db/client';
import {
  flushTestDbSerial,
  resetAndSeedForTests,
  resetBaselineSeedFlag,
  setupTestDb,
  teardownTestDb
} from './helpers/db';
import type postgres from 'postgres';

const MANIFEST_PATH = join(process.cwd(), 'seed', 'templates', 'manifest.json');
const CSV_PATH = join(process.cwd(), 'seed', 'clientes-presupuestossys.csv');

describe('database seed', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
    await flushTestDbSerial();
    resetBaselineSeedFlag();
    await resetAndSeedForTests(sql);
  }, 120_000);

  afterAll(async () => {
    await teardownTestDb();
  });

  it('seeds one admin and two tecnicos', async () => {
    const users = await sql<{ role: string; active: boolean; password_hash: string }[]>`
      SELECT role, active, password_hash FROM app_user ORDER BY email
    `;
    expect(users).toHaveLength(3);
    expect(users.filter((u) => u.role === 'admin' && u.active)).toHaveLength(1);
    expect(users.filter((u) => u.role === 'tecnico' && u.active)).toHaveLength(2);
    for (const user of users) {
      expect(user.password_hash.length).toBeGreaterThan(20);
      expect(user.password_hash).not.toContain('changeme');
    }
  });

  it('seeds three active templates with sections and items', async () => {
    const templates = await sql<{ code: string; status: string }[]>`
      SELECT code, status FROM template WHERE status = 'active' ORDER BY code
    `;
    expect(templates.map((t) => t.code)).toEqual(['erp-estandar', 'erp-tango', 'it']);

    const sections = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM section
    `;
    expect(Number(sections[0].count)).toBeGreaterThan(0);

    const items = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM template_item
    `;
    expect(Number(items[0].count)).toBeGreaterThan(0);
  });

  it('template item count matches fixture manifest', async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as {
      templates: Array<{ code: string; version: string; sections: number; items: number }>;
    };

    for (const expected of manifest.templates) {
      const [template] = await sql<{ id: string }[]>`
        SELECT id FROM template
        WHERE code = ${expected.code} AND version = ${expected.version}
      `;
      expect(template, `template ${expected.code}`).toBeDefined();

      const [sectionCount] = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM section WHERE template_id = ${template.id}
      `;
      expect(Number(sectionCount.count)).toBe(expected.sections);

      const [itemCount] = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count
        FROM template_item ti
        JOIN section s ON s.id = ti.section_id
        WHERE s.template_id = ${template.id}
      `;
      expect(Number(itemCount.count)).toBe(expected.items);
    }
  });

  it('scoring items have rubric in options', async () => {
    const scoringItems = await sql<
      { field_type: string; options: Record<string, unknown> }[]
    >`
      SELECT field_type, options
      FROM template_item
      WHERE scores = true
    `;

    expect(scoringItems.length).toBeGreaterThan(0);

    for (const item of scoringItems) {
      if (item.field_type === 'select' || item.field_type === 'multiselect') {
        expect(item.options.score_map).toBeDefined();
      }
      if (item.field_type === 'number' || item.field_type === 'money') {
        expect(item.options.thresholds).toBeDefined();
      }
      if (item.field_type === 'table') {
        expect(item.options.eol_rules).toBeDefined();
      }
    }
  });

  it('score_map values use 0 50 or 100 scale', async () => {
    const maps = await sql<{ options: { score_map?: Record<string, number> } }[]>`
      SELECT options FROM template_item
      WHERE field_type IN ('select', 'multiselect')
        AND scores = true
    `;

    for (const row of maps) {
      const scoreMap = row.options.score_map ?? {};
      for (const score of Object.values(scoreMap)) {
        expect([0, 50, 100]).toContain(score);
      }
    }
  });

  it('imports clients from csv count', async () => {
    const csvContent = await readFile(CSV_PATH, 'utf8');
    const expectedCount = (
      parse(csvContent, { columns: true, skip_empty_lines: true, relax_quotes: true }) as unknown[]
    ).length;

    const [row] = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM client
    `;
    expect(Number(row.count)).toBe(expectedCount);
  });

  it('maps csv columns to client fields', async () => {
    const [client] = await sql<
      {
        razon_social: string;
        cuit: string;
        direccion: string | null;
        provincia: string | null;
      }[]
    >`
      SELECT razon_social, cuit, direccion, provincia
      FROM client
      WHERE razon_social = 'A L SRL'
      LIMIT 1
    `;

    expect(client.razon_social).toBe('A L SRL');
    expect(client.cuit).toBe('30642277428');
    expect(client.direccion).toContain('TUCUMAN');
    expect(client.provincia).toBe('CORRIENTES');
  });

  it('seed is idempotent on second run', async () => {
    const first = {
      users: Number((await sql`SELECT COUNT(*)::text AS c FROM app_user`)[0].c),
      templates: Number((await sql`SELECT COUNT(*)::text AS c FROM template`)[0].c),
      items: Number((await sql`SELECT COUNT(*)::text AS c FROM template_item`)[0].c),
      clients: Number((await sql`SELECT COUNT(*)::text AS c FROM client`)[0].c)
    };

    await runSeed(sql);
    const second = {
      users: Number((await sql`SELECT COUNT(*)::text AS c FROM app_user`)[0].c),
      templates: Number((await sql`SELECT COUNT(*)::text AS c FROM template`)[0].c),
      items: Number((await sql`SELECT COUNT(*)::text AS c FROM template_item`)[0].c),
      clients: Number((await sql`SELECT COUNT(*)::text AS c FROM client`)[0].c)
    };

    expect(second).toEqual(first);
  });
});
