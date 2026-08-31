import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { createSql, setSqlForTests } from '../src/lib/server/db/client';
import { runMigrations } from '../src/lib/server/db/migrate';
import { runSeed } from '../src/lib/server/db/seed';
import { withDbSuiteLock } from '../tests/helpers/db-lock';
import { insertTestAuditRow, insertAuditResponse } from '../tests/helpers/backoffice';
import { findUserIdByEmail } from '../tests/helpers/auth';
import {
  cambiarEstadoEscaneo,
  crearEscaneo,
  upsertDispositivos
} from '../src/lib/server/escaneos/repo';
import { dispositivoInput } from '../src/lib/server/escaneos/schemas';

function connectionString(): string {
  return process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp';
}

async function resetVolatileForE2e(sql: postgres.Sql): Promise<void> {
  await sql`
    TRUNCATE TABLE
      attachment,
      audit_closure,
      audit_section_score,
      audit_response,
      audit,
      session
    RESTART IDENTITY CASCADE
  `;
}

/**
 * Garantiza auditoría en_relevamiento con 2 escaneos (misma MAC → grupo
 * consolidado) y una fila de inventario manual para fusionar. Retorna auditId.
 */
export async function ensureE2eEscaneosAudit(existingSql?: postgres.Sql): Promise<string> {
  const owned = !existingSql;
  const sql = existingSql ?? createSql(connectionString());
  let auditId = '';

  await withDbSuiteLock(sql, async (s) => {
    await runMigrations(s);
    await runSeed(s);
    await resetVolatileForE2e(s);
    setSqlForTests(s);

    const seeded = await insertTestAuditRow(s, {
      razonSocial: 'E2E Escaneos Demo',
      status: 'en_relevamiento'
    });
    auditId = seeded.auditId;
    const empresaId = seeded.clientId;
    const tecnicoId = await findUserIdByEmail(s, 'facu@serviciosysistemas.com.ar');

    // Dos escaneos con la misma MAC: el consolidado los deduplica (R9)
    for (const [i, etiqueta] of ['VLAN administración', 'VLAN depósito'].entries()) {
      const esc = await crearEscaneo(empresaId, tecnicoId, {
        auditId,
        etiqueta,
        rangoObjetivo: `192.168.${i}.0/24`,
        agenteVersion: '1.0.0',
        consentimientoPor: 'CTO del cliente',
        consentimientoAt: new Date('2026-08-20T09:00:00Z')
      });
      await cambiarEstadoEscaneo(empresaId, esc.id, 'en_curso');
      await upsertDispositivos(empresaId, esc.id, [
        dispositivoInput.parse({
          mac: 'AA:BB:CC:DD:EE:E0',
          ip: `192.168.${i}.10`,
          hostname: 'srv-archivos',
          tipo: 'servidor',
          soNombre: 'Debian 12',
          vistoAt: new Date(`2026-08-2${i}T10:00:00Z`),
          software: [{ nombre: 'nginx', version: '1.24' }],
          servicios: [{ puerto: 443, protocolo: 'tcp', estadoPuerto: 'open', servicio: 'https' }]
        })
      ]);
    }

    // Fila del relevamiento manual (ítem-tabla de la plantilla it) para fusionar
    const [item] = await s<{ id: string }[]>`
      SELECT ti.id
      FROM audit a
      JOIN section s ON s.template_id = ANY(a.template_ids)
      JOIN template_item ti ON ti.section_id = s.id AND ti.field_type = 'table'
      WHERE a.id = ${auditId}
      ORDER BY s.sort_order, ti.sort_order
      LIMIT 1
    `;
    await insertAuditResponse(s, auditId, item.id, {
      rows: [
        {
          row_id: randomUUID(),
          cells: { tipo: 'Servidor', marca: 'HP', modelo: 'ProLiant DL380', antiguedad: 3, estado_eol: 'vigente' },
          attachment_ids: []
        }
      ]
    });
  });

  if (owned) {
    await sql.end({ timeout: 5 });
  }

  return auditId;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const id = await ensureE2eEscaneosAudit();
  console.log('E2E_ESCANEOS_AUDIT_ID=', id);
}
