import type postgres from 'postgres';
import { setSqlForTests } from '../../src/lib/server/db/client';
import { findUserByEmail } from '../helpers/auth';
import { getTemplateIdByCode, insertAuditResponse } from '../helpers/backoffice';
import { insertTestEmpresa } from '../helpers/empresa';

/**
 * Seed dedicado de #43: auditorías cerradas con control total sobre `erp_actual`, `rubro`,
 * `segment`, `provincia`, `relacion`, `estado_override`, índices, módulos Tango y
 * `top_risks`/`quick_wins`, para ejercitar los 5 bloques accionables y la supresión n<3.
 */
export type AccionableSeedAudit = {
  razonSocial: string;
  segment: 'A' | 'B' | 'C';
  rubro?: string | null;
  erpActual?: string | null;
  provincia?: string | null;
  relacion?: 'cliente' | 'prospecto' | 'ex_cliente';
  estadoOverride?: string | null;
  status?: 'cerrada' | 'en_cierre' | 'borrador';
  indiceIt?: number | null;
  indiceErp?: number | null;
  modulos?: string[] | null;
  topRisks?: Array<{ text: string; severity: 'baja' | 'media' | 'alta' | 'critica' }>;
  quickWins?: string[];
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

export async function insertAccionableAudit(
  sql: postgres.Sql,
  audit: AccionableSeedAudit
): Promise<{ auditId: string; empresaId: string }> {
  setSqlForTests(sql);
  const tech = await findUserByEmail(sql, 'facu@serviciosysistemas.com.ar');
  if (!tech) throw new Error('tech not found');

  const types = ['it', 'erp-tango'];
  const templateIds = await Promise.all(types.map((t) => getTemplateIdByCode(sql, t)));
  const status = audit.status ?? 'cerrada';

  const empresaId = await insertTestEmpresa(sql, {
    razonSocial: audit.razonSocial,
    relacion: audit.relacion ?? 'cliente'
  });
  await sql`
    UPDATE empresa
    SET
      rubro = ${audit.rubro ?? null},
      erp_actual = ${audit.erpActual ?? null},
      provincia = ${audit.provincia ?? null},
      estado_override = ${audit.estadoOverride ?? null}
    WHERE id = ${empresaId}::uuid
  `;

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO audit (
      empresa_id, name, types, template_ids, segment, status, assigned_tech_id, closed_at
    )
    VALUES (
      ${empresaId},
      ${'Auditoría ' + audit.razonSocial},
      ${types},
      ${templateIds}::uuid[],
      ${audit.segment},
      ${status},
      ${tech.id},
      ${status === 'cerrada' ? audit.closedAt : null}
    )
    RETURNING id
  `;

  if (status === 'cerrada') {
    await sql`
      INSERT INTO audit_closure (
        audit_id, indice_it, indice_erp, top_risks, quick_wins, upsell_findings, closed_at, closed_by
      )
      VALUES (
        ${row.id},
        ${audit.indiceIt ?? null},
        ${audit.indiceErp ?? null},
        ${sql.json((audit.topRisks ?? []) as never)},
        ${sql.json((audit.quickWins ?? []) as never)},
        ${sql.json([] as never)},
        ${audit.closedAt},
        ${tech.id}
      )
    `;

    if (audit.modulos && audit.modulos.length > 0) {
      const modulosItemId = await getModulosItemId(sql);
      if (modulosItemId) {
        await insertAuditResponse(sql, row.id, modulosItemId, audit.modulos);
      }
    }
  }

  return { auditId: row.id, empresaId };
}

/** Universo base de 8 auditorías cerradas + 1 en_cierre (excluida) con datos deterministas. */
export async function seedMercadoAccionable(sql: postgres.Sql): Promise<void> {
  const audits: AccionableSeedAudit[] = [
    {
      razonSocial: 'Acc Tango Corrientes 1',
      segment: 'A',
      rubro: 'Industria',
      erpActual: 'Tango Gestión',
      provincia: 'Corrientes',
      relacion: 'cliente',
      indiceIt: 70,
      indiceErp: 80,
      modulos: ['ventas', 'stock', 'compras'],
      topRisks: [{ text: 'Falta backup diario', severity: 'alta' }],
      quickWins: ['Actualizar antivirus'],
      closedAt: new Date('2026-01-10T12:00:00Z')
    },
    {
      razonSocial: 'Acc Tango Corrientes 2',
      segment: 'A',
      rubro: 'Industria',
      erpActual: 'tango gestión',
      provincia: '  corrientes ',
      relacion: 'cliente',
      indiceIt: 60,
      indiceErp: 60,
      modulos: ['ventas', 'stock'],
      topRisks: [{ text: 'Firewall desactualizado', severity: 'media' }],
      quickWins: ['Renovar licencia office'],
      closedAt: new Date('2026-02-10T12:00:00Z')
    },
    {
      razonSocial: 'Acc Tango Corrientes 3',
      segment: 'A',
      rubro: 'Industria',
      erpActual: 'Tango',
      provincia: 'CORRIENTES',
      relacion: 'ex_cliente',
      indiceIt: 50,
      indiceErp: null,
      modulos: ['ventas'],
      topRisks: [{ text: 'Servidor obsoleto fuera de soporte', severity: 'critica' }],
      quickWins: [],
      closedAt: new Date('2026-03-10T12:00:00Z')
    },
    {
      razonSocial: 'Acc SAP Chaco',
      segment: 'B',
      rubro: 'Comercio',
      erpActual: 'SAP',
      provincia: 'Chaco',
      relacion: 'cliente',
      indiceIt: 30,
      indiceErp: 40,
      modulos: null,
      topRisks: [{ text: 'Red wifi inestable', severity: 'media' }],
      quickWins: ['Mejorar cableado de red'],
      closedAt: new Date('2026-04-10T12:00:00Z')
    },
    {
      razonSocial: 'Acc Bejerman Chaco',
      segment: 'B',
      rubro: 'Comercio',
      erpActual: 'Bejerman',
      provincia: 'Chaco',
      relacion: 'cliente',
      indiceIt: 45,
      indiceErp: 55,
      modulos: null,
      topRisks: [],
      quickWins: ['Revisar backups'],
      closedAt: new Date('2026-05-10T12:00:00Z')
    },
    {
      razonSocial: 'Acc Odoo Formosa',
      segment: 'B',
      rubro: 'Comercio',
      erpActual: 'Odoo',
      provincia: 'Formosa',
      relacion: 'cliente',
      indiceIt: 55,
      indiceErp: 65,
      modulos: null,
      topRisks: [{ text: 'Algo no clasificable xyz', severity: 'baja' }],
      quickWins: [],
      closedAt: new Date('2026-06-10T12:00:00Z')
    },
    {
      razonSocial: 'Acc SinErp Null Servicios',
      segment: 'C',
      rubro: 'Servicios',
      erpActual: null,
      provincia: null,
      relacion: 'cliente',
      indiceIt: null,
      indiceErp: null,
      modulos: null,
      topRisks: [],
      quickWins: [],
      closedAt: new Date('2026-07-10T12:00:00Z')
    },
    {
      razonSocial: 'Acc SinErp Empty',
      segment: 'C',
      rubro: null,
      erpActual: '',
      provincia: '',
      relacion: 'cliente',
      estadoOverride: 'inactiva',
      indiceIt: 85,
      indiceErp: 90,
      modulos: null,
      topRisks: [{ text: 'Hardware EOL en disco', severity: 'alta' }],
      quickWins: ['Plan de licencias'],
      closedAt: new Date('2026-08-10T12:00:00Z')
    },
    {
      razonSocial: 'Acc Excluida En Cierre',
      segment: 'A',
      rubro: 'Industria',
      erpActual: 'Tango',
      provincia: 'Corrientes',
      relacion: 'cliente',
      status: 'en_cierre',
      closedAt: new Date('2026-09-10T12:00:00Z')
    }
  ];

  for (const audit of audits) {
    await insertAccionableAudit(sql, audit);
  }
}
