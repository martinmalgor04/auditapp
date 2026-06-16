import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { findUserByEmail } from '../helpers/auth';
import { getTemplateIdByCode, insertAuditResponse } from '../helpers/backoffice';

export type MercadoSeedAudit = {
  razonSocial: string;
  cuit?: string;
  referenteNombre?: string;
  segment: 'A' | 'B' | 'C';
  rubro?: string | null;
  erpActual?: string | null;
  status: 'cerrada' | 'en_cierre' | 'borrador';
  indiceIt?: number | null;
  indiceErp?: number | null;
  modulos?: string[] | null | 'invalid';
  upsell?: string[];
  closedAt: Date;
};

async function getModulosItemId(sql: postgres.Sql): Promise<string | null> {
  const templateId = await getTemplateIdByCode(sql, 'erp-tango');
  const [row] = await sql<{ id: string }[]>`
    SELECT ti.id
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE s.template_id = ${templateId}
      AND s.code = 'CAB'
      AND ti.options->>'item_code' = 'cab_modulos_tango'
    LIMIT 1
  `;
  return row?.id ?? null;
}

export async function insertMercadoAudit(
  sql: postgres.Sql,
  audit: MercadoSeedAudit
): Promise<{ auditId: string; clientId: string }> {
  setSqlForTests(sql);
  const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
  if (!tech) throw new Error('tech not found');

  const types = ['it', 'erp-tango'];
  const templateIds = await Promise.all(types.map((t) => getTemplateIdByCode(sql, t)));

  // client.cuit es UNIQUE parcial desde migración 013; limpiar cualquier fila previa
  // con el mismo CUIT para que re-seedeos del fixture sean idempotentes.
  if (audit.cuit) {
    await sql`DELETE FROM client WHERE cuit = ${audit.cuit}`;
  }

  const [client] = await sql<{ id: string }[]>`
    INSERT INTO client (
      razon_social, cuit, rubro, erp_actual, referente_nombre
    )
    VALUES (
      ${audit.razonSocial},
      ${audit.cuit ?? null},
      ${audit.rubro ?? null},
      ${audit.erpActual ?? null},
      ${audit.referenteNombre ?? null}
    )
    RETURNING id
  `;

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO audit (
      empresa_id, name, types, template_ids, segment, status,
      assigned_tech_id, closed_at
    )
    VALUES (
      ${client.id},
      ${'Auditoría ' + audit.razonSocial},
      ${types},
      ${templateIds}::uuid[],
      ${audit.segment},
      ${audit.status},
      ${tech.id},
      ${audit.status === 'cerrada' ? audit.closedAt : null}
    )
    RETURNING id
  `;

  if (audit.status === 'cerrada') {
    await sql`
      INSERT INTO audit_closure (
        audit_id, indice_it, indice_erp, upsell_findings, closed_at, closed_by
      )
      VALUES (
        ${row.id},
        ${audit.indiceIt ?? null},
        ${audit.indiceErp ?? null},
        ${sql.json((audit.upsell ?? []) as never)},
        ${audit.closedAt},
        ${tech.id}
      )
    `;

    const modulosItemId = await getModulosItemId(sql);
    if (modulosItemId && audit.modulos !== undefined) {
      if (audit.modulos === 'invalid') {
        await insertAuditResponse(sql, row.id, modulosItemId, 'no-array');
      } else if (audit.modulos) {
        await insertAuditResponse(sql, row.id, modulosItemId, audit.modulos);
      }
    }
  }

  return { auditId: row.id, clientId: client.id };
}

export async function seedMercadoDashboardFixtures(sql: postgres.Sql): Promise<{
  closedCount: number;
  identifiable: {
    razonSocial: string;
    cuit: string;
    referenteNombre: string;
  };
}> {
  const identifiable = {
    razonSocial: 'Mercado Seed SA Identificable',
    cuit: '30-99999999-1',
    referenteNombre: 'Referente Secreto Mercado'
  };

  await insertMercadoAudit(sql, {
    ...identifiable,
    segment: 'A',
    rubro: 'Industria',
    erpActual: 'Tango Gestión',
    status: 'cerrada',
    indiceIt: 80,
    indiceErp: 75,
    modulos: ['ventas', 'stock'],
    upsell: ['Renovar firewall', 'Backup cloud'],
    closedAt: new Date('2026-01-15T12:00:00Z')
  });

  await insertMercadoAudit(sql, {
    razonSocial: 'Mercado Seed 2',
    segment: 'A',
    rubro: 'Industria',
    erpActual: 'Tango Gestión',
    status: 'cerrada',
    indiceIt: 60,
    indiceErp: 45,
    modulos: ['ventas', 'compras'],
    upsell: [],
    closedAt: new Date('2026-01-20T12:00:00Z')
  });

  await insertMercadoAudit(sql, {
    razonSocial: 'Mercado Seed 3',
    segment: 'B',
    rubro: 'Comercio',
    erpActual: null,
    status: 'cerrada',
    indiceIt: 30,
    indiceErp: null,
    modulos: ['stock'],
    upsell: ['Licencias Office'],
    closedAt: new Date('2026-02-10T12:00:00Z')
  });

  await insertMercadoAudit(sql, {
    razonSocial: 'Mercado Seed 4',
    segment: 'C',
    rubro: null,
    erpActual: '',
    status: 'cerrada',
    indiceIt: null,
    indiceErp: 85,
    modulos: 'invalid',
    upsell: [],
    closedAt: new Date('2026-03-05T12:00:00Z')
  });

  await insertMercadoAudit(sql, {
    razonSocial: 'Mercado Seed 5',
    segment: 'A',
    rubro: 'Agro',
    erpActual: 'Bejerman',
    status: 'cerrada',
    indiceIt: 50,
    indiceErp: 55,
    modulos: ['stock'],
    upsell: [],
    closedAt: new Date('2026-03-15T12:00:00Z')
  });

  await insertMercadoAudit(sql, {
    razonSocial: 'Mercado Excluida En Cierre',
    segment: 'A',
    rubro: 'Fantasma',
    erpActual: 'SAP',
    status: 'en_cierre',
    closedAt: new Date('2026-03-20T12:00:00Z')
  });

  await insertMercadoAudit(sql, {
    razonSocial: 'Mercado Excluida Borrador',
    segment: 'A',
    rubro: 'Fantasma',
    erpActual: 'SAP',
    status: 'borrador',
    closedAt: new Date('2026-03-20T12:00:00Z')
  });

  return { closedCount: 5, identifiable };
}

export async function seedMercadoGroupOfThree(sql: postgres.Sql): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await insertMercadoAudit(sql, {
      razonSocial: `Mercado Grupo Completo ${i + 1}`,
      segment: 'B',
      rubro: 'Servicios',
      erpActual: 'Tango Gestión',
      status: 'cerrada',
      indiceIt: 70 + i,
      indiceErp: 65 + i,
      modulos: ['ventas'],
      upsell: [],
      closedAt: new Date(`2026-04-0${i + 1}T12:00:00Z`)
    });
  }
}
