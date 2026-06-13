import type postgres from 'postgres';
import { insertReport } from '../../src/lib/server/db/informe-reports';
import type { AppUser } from '../../src/lib/server/auth/types';
import { indexToSemaphore } from '../../src/lib/server/scoring/semaphore';
import { findUserByEmail } from '../helpers/auth';
import { seedCanonicalAuditFixture } from './canonical-audit';
import {
  buildValidClientDraft,
  buildValidInternalDraft,
  loadInformeCanonicalGolden
} from './informe-claude-mock';

export type InformeShareFixture = {
  auditId: string;
  reportId: string;
  version: number;
  admin: AppUser;
  tech: AppUser;
};

/** Informe en `borrador` o `aprobado` listo para compartir (#15). */
export async function seedReportForShare(
  sql: postgres.Sql,
  status: 'borrador' | 'aprobado' = 'aprobado'
): Promise<InformeShareFixture> {
  const golden = loadInformeCanonicalGolden();
  const admin = (await findUserByEmail(sql, 'admin@serviciosysistemas.com.ar'))!;
  const tech = (await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar'))!;
  const { auditId } = await seedCanonicalAuditFixture(sql);

  const row = await insertReport({
    auditId,
    canonicalJson: golden,
    schemaVersion: golden.schema_version,
    requestedBy: admin.id
  });

  const clientDraft = buildValidClientDraft(['A1', 'A2', 'A3']);
  clientDraft.indices = {
    it: { valor: golden.indices.it!, semaforo: indexToSemaphore(golden.indices.it!) },
    erp: { valor: golden.indices.erp!, semaforo: indexToSemaphore(golden.indices.erp!) }
  };

  await sql`
    UPDATE audit_report
    SET status = 'borrador',
        client_draft = ${sql.json(clientDraft as never)},
        internal_draft = ${sql.json(buildValidInternalDraft() as never)}
    WHERE id = ${row.id}
  `;
  if (status === 'aprobado') {
    await sql`
      UPDATE audit_report
      SET status = 'aprobado', approved_by = ${admin.id}, approved_at = now()
      WHERE id = ${row.id}
    `;
  }

  return { auditId, reportId: row.id, version: row.version, admin, tech };
}
