import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setSqlForTests } from '../src/lib/server/db/client';
import {
  insertManualReport,
  listReportsByAudit
} from '../src/lib/server/db/informe-reports';
import { findUserIdByEmail } from './helpers/auth';
import { insertTestAuditRow } from './helpers/backoffice';
import { setupTestDb, teardownTestDb } from './helpers/db';
import type postgres from 'postgres';

describe('insertManualReport atomic (#58)', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = await setupTestDb();
    setSqlForTests(sql);
  });

  beforeEach(() => {
    setSqlForTests(sql);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('allocates increasing versions and returns null without prior report', async () => {
    const { auditId } = await insertTestAuditRow(sql, {
      razonSocial: 'Manual Insert SA',
      status: 'cerrada'
    });
    const userId = await findUserIdByEmail(sql, 'admin@serviciosysistemas.com.ar');

    expect(
      await insertManualReport({
        auditId,
        htmlManual: '<html><body>x</body></html>',
        uploadedBy: userId
      })
    ).toBeNull();

    const canonical = {
      schema_version: '1.0',
      types: ['it'],
      sections: []
    };

    await sql`
      INSERT INTO audit_report (
        audit_id, version, status, source, canonical_json, schema_version, requested_by, approved_by, approved_at
      )
      VALUES (
        ${auditId}, 1, 'aprobado', 'ia', ${sql.json(canonical as never)}, '1.0', ${userId}, ${userId}, now()
      )
    `;

    const a = await insertManualReport({
      auditId,
      htmlManual: '<html><body>A</body></html>',
      uploadedBy: userId
    });
    const b = await insertManualReport({
      auditId,
      htmlManual: '<html><body>B</body></html>',
      uploadedBy: userId
    });

    expect(a?.version).toBe(2);
    expect(a?.source).toBe('manual');
    expect(b?.version).toBe(3);

    const versions = (await listReportsByAudit(auditId)).map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
  });
});
