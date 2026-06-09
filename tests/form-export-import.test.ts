import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import { buildFormBackup, importFormBackup } from '../src/lib/server/form/export-import';
import { formBackupSchema } from '../src/lib/server/form/schemas';
import { mergeResponsesForExport, validateBackupJson } from '../src/lib/client/form/backup';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { findUserByEmail } from './helpers/auth';
import { seedAuditFormFixture, getScoredSelectItem } from './fixtures/audit-form';
import type postgres from 'postgres';

describe('form export import', () => {
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

  it('export produces valid JSON including queued local response', () => {
    const auditId = '00000000-0000-4000-8000-000000000010';
    const backup = mergeResponsesForExport(
      auditId,
      [{ itemId: '00000000-0000-4000-8000-000000000020', value: 'server', na: false }],
      [
        {
          auditId,
          itemId: '00000000-0000-4000-8000-000000000021',
          value: 'queued',
          na: false,
          enqueuedAt: new Date().toISOString(),
          attempts: 0
        }
      ]
    );
    expect(() => validateBackupJson(backup)).not.toThrow();
    expect(backup.responses).toHaveLength(2);
  });

  it('import restores values for same audit_id', async () => {
    const { auditId } = await seedAuditFormFixture(sql);
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const scored = await getScoredSelectItem(sql, auditId);
    expect(scored).toBeTruthy();

    const choice = scored!.choices[0];
    const backup = buildFormBackup(auditId, [
      { itemId: scored!.itemId, value: choice, na: false, notes: 'import test' }
    ]);

    const result = await importFormBackup(auditId, tech!, backup);
    expect(result.imported).toBe(1);

    const [row] = await sql<{ value: string; source: string }[]>`
      SELECT value, source FROM audit_response
      WHERE audit_id = ${auditId} AND item_id = ${scored!.itemId}
    `;
    expect(row.value).toBe(choice);
    expect(row.source).toBe('tecnico');
  });

  it('rejects backup from another audit', async () => {
    const { auditId } = await seedAuditFormFixture(sql, { razonSocial: 'Import Mismatch SA' });
    const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
    const backup = formBackupSchema.parse({
      schema_version: '1.0',
      audit_id: '00000000-0000-4000-8000-000000000099',
      exported_at: new Date().toISOString(),
      responses: []
    });

    await expect(importFormBackup(auditId, tech!, backup)).rejects.toThrow(/otra auditoría/);
  });
});
