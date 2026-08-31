import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import {
  cambiarEstadoEscaneo,
  crearEscaneo,
  upsertDispositivos
} from '../src/lib/server/escaneos/repo';
import {
  desvincularDispositivo,
  fusionarDispositivo,
  marcarRevisionGrupo
} from '../src/lib/server/escaneos/revision';
import { obtenerDispositivoConsolidado } from '../src/lib/server/escaneos/consolidado';
import { dispositivoInput, type DispositivoInput } from '../src/lib/server/escaneos/schemas';
import { findUserIdByEmail } from './helpers/auth';
import {
  getFirstTemplateItemId,
  getTemplateIdByCode,
  insertAuditResponse,
  insertTestAuditRow
} from './helpers/backoffice';
import { insertTestEmpresa } from './helpers/empresa';
import { setupTestDb, teardownTestDb } from './helpers/db';

const ADMIN = 'admin@serviciosysistemas.com.ar';
const TECNICO = 'facu@serviciosysistemas.com.ar';
const MAC = 'AA:BB:CC:DD:EE:90';
const IDENTIDAD = 'aabbccddee90';

function chunk(d: unknown): DispositivoInput {
  return dispositivoInput.parse(d);
}

describe('escaneos — revisión por grupo y vínculo con relevamiento (#62)', () => {
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

  async function fixtures(razonSocial: string) {
    const { auditId, clientId: empresaId } = await insertTestAuditRow(sql, { razonSocial });
    const tecnicoId = await findUserIdByEmail(sql, TECNICO);
    const adminId = await findUserIdByEmail(sql, ADMIN);
    return { auditId, empresaId, tecnicoId, adminId };
  }

  /** Dos escaneos con la misma identidad (2 ocurrencias del grupo). */
  async function grupoEnDosEscaneos(empresaId: string, auditId: string, tecnicoId: string) {
    const escaneos = [];
    for (const [i, etiqueta] of ['VLAN 10', 'VLAN 20'].entries()) {
      const esc = await crearEscaneo(empresaId, tecnicoId, {
        auditId,
        etiqueta,
        rangoObjetivo: `192.168.${i}.0/24`,
        agenteVersion: '1.0.0',
        consentimientoPor: 'CTO',
        consentimientoAt: new Date('2026-08-20T09:00:00Z')
      });
      await cambiarEstadoEscaneo(empresaId, esc.id, 'en_curso');
      await upsertDispositivos(empresaId, esc.id, [
        chunk({
          mac: MAC,
          ip: `192.168.${i}.90`,
          vistoAt: new Date(`2026-08-2${i}T10:00:00Z`)
        })
      ]);
      escaneos.push(esc);
    }
    return escaneos;
  }

  async function ocurrenciasDelGrupo() {
    return sql<
      {
        id: string;
        revision: string;
        revisado_por: string | null;
        revisado_at: Date | null;
        nota_tecnico: string | null;
        relevamiento_item_id: string | null;
        relevamiento_row_id: string | null;
      }[]
    >`
      SELECT id, revision, revisado_por, revisado_at, nota_tecnico,
             relevamiento_item_id, relevamiento_row_id
      FROM escaneo_dispositivo WHERE identidad = ${IDENTIDAD}
      ORDER BY escaneo_id
    `;
  }

  /** Ítem-tabla de la plantilla de la auditoría + response con una fila. */
  async function filaManual(auditId: string) {
    const [item] = await sql<{ id: string; label: string }[]>`
      SELECT ti.id, ti.label
      FROM audit a
      JOIN section s ON s.template_id = ANY(a.template_ids)
      JOIN template_item ti ON ti.section_id = s.id AND ti.field_type = 'table'
      WHERE a.id = ${auditId}
      ORDER BY s.sort_order, ti.sort_order
      LIMIT 1
    `;
    const rowId = randomUUID();
    const value = {
      rows: [
        {
          row_id: rowId,
          cells: { tipo: 'Servidor', marca: 'HP', modelo: 'DL380', antiguedad: '', estado_eol: '' },
          attachment_ids: []
        }
      ]
    };
    await insertAuditResponse(sql, auditId, item.id, value);
    return { itemId: item.id, itemLabel: item.label, rowId, value };
  }

  it('marcarRevisionGrupo confirmado → todas las ocurrencias con quién/cuándo y nota (R20)', async () => {
    const { auditId, empresaId, tecnicoId, adminId } = await fixtures('Marcar Grupo SA');
    await grupoEnDosEscaneos(empresaId, auditId, tecnicoId);

    const actualizadas = await marcarRevisionGrupo(
      empresaId,
      auditId,
      IDENTIDAD,
      'confirmado',
      adminId,
      'Verificado en sitio'
    );
    expect(actualizadas).toBe(2);

    const filas = await ocurrenciasDelGrupo();
    expect(filas).toHaveLength(2);
    for (const f of filas) {
      expect(f.revision).toBe('confirmado');
      expect(f.revisado_por).toBe(adminId);
      expect(f.revisado_at).not.toBeNull();
      expect(f.nota_tecnico).toBe('Verificado en sitio');
    }

    // Sin nota (undefined) conserva la existente
    await marcarRevisionGrupo(empresaId, auditId, IDENTIDAD, 'descartado', adminId);
    const tras = await ocurrenciasDelGrupo();
    expect(tras[0].revision).toBe('descartado');
    expect(tras[0].nota_tecnico).toBe('Verificado en sitio');

    // Grupo inexistente / empresa ajena → not found, cero escrituras
    await expect(
      marcarRevisionGrupo(empresaId, auditId, 'no-existe', 'confirmado', adminId)
    ).rejects.toMatchObject({ code: 'ESCANEO_NOT_FOUND' });
    const otraEmpresa = await insertTestEmpresa(sql, { razonSocial: 'Ajena Revision SA' });
    await expect(
      marcarRevisionGrupo(otraEmpresa, auditId, IDENTIDAD, 'confirmado', adminId)
    ).rejects.toMatchObject({ code: 'ESCANEO_NOT_FOUND' });
  });

  it('fusionarDispositivo → vínculo + fusionado en todas las ocurrencias (R21)', async () => {
    const { auditId, empresaId, tecnicoId, adminId } = await fixtures('Fusion SA');
    await grupoEnDosEscaneos(empresaId, auditId, tecnicoId);
    const { itemId, rowId } = await filaManual(auditId);

    const actualizadas = await fusionarDispositivo(
      empresaId,
      auditId,
      IDENTIDAD,
      itemId,
      rowId,
      adminId,
      'Es el servidor de archivos'
    );
    expect(actualizadas).toBe(2);

    const filas = await ocurrenciasDelGrupo();
    for (const f of filas) {
      expect(f.revision).toBe('fusionado');
      expect(f.relevamiento_item_id).toBe(itemId);
      expect(f.relevamiento_row_id).toBe(rowId);
      expect(f.revisado_por).toBe(adminId);
      expect(f.revisado_at).not.toBeNull();
      expect(f.nota_tecnico).toBe('Es el servidor de archivos');
    }

    // El consolidado expone el vínculo resuelto y vivo
    const detalle = await obtenerDispositivoConsolidado(empresaId, auditId, IDENTIDAD);
    expect(detalle.revision).toBe('fusionado');
    expect(detalle.vinculo).toMatchObject({ itemId, rowId, vivo: true });
    expect(detalle.vinculo?.itemLabel).toContain('equipos');
    expect(detalle.vinculo?.resumenFila).toContain('Servidor');
  });

  it('fusión con destino inválido → VINCULO_RELEVAMIENTO_INVALIDO sin mutar nada (R22,R28)', async () => {
    const { auditId, empresaId, tecnicoId, adminId } = await fixtures('Fusion Invalida SA');
    await grupoEnDosEscaneos(empresaId, auditId, tecnicoId);
    const { itemId, rowId } = await filaManual(auditId);
    const itemNoTabla = await getFirstTemplateItemId(sql, 'it');
    const templateErp = await getTemplateIdByCode(sql, 'erp-tango');
    const [itemErp] = await sql<{ id: string }[]>`
      SELECT ti.id FROM template_item ti
      JOIN section s ON s.id = ti.section_id
      WHERE s.template_id = ${templateErp} LIMIT 1
    `;

    const intentos: [string, string][] = [
      [randomUUID(), rowId], // ítem inexistente
      [itemNoTabla, rowId], // ítem no-tabla
      [itemErp.id, rowId], // ítem de otra plantilla
      [itemId, randomUUID()] // row_id ausente en value.rows
    ];
    for (const [item, row] of intentos) {
      await expect(
        fusionarDispositivo(empresaId, auditId, IDENTIDAD, item, row, adminId)
      ).rejects.toMatchObject({ code: 'VINCULO_RELEVAMIENTO_INVALIDO' });
    }
    // Empresa ajena: el destino no resuelve en el scope → rechazo (R28)
    const otraEmpresa = await insertTestEmpresa(sql, { razonSocial: 'Ajena Fusion SA' });
    await expect(
      fusionarDispositivo(otraEmpresa, auditId, IDENTIDAD, itemId, rowId, adminId)
    ).rejects.toMatchObject({ code: 'VINCULO_RELEVAMIENTO_INVALIDO' });

    // Cero escrituras: el grupo sigue intacto
    const filas = await ocurrenciasDelGrupo();
    for (const f of filas) {
      expect(f.revision).toBe('sin_revisar');
      expect(f.relevamiento_item_id).toBeNull();
      expect(f.relevamiento_row_id).toBeNull();
    }
  });

  it('la fusión NO escribe audit_response: value idéntico antes y después (R23)', async () => {
    const { auditId, empresaId, tecnicoId, adminId } = await fixtures('No Toque SA');
    await grupoEnDosEscaneos(empresaId, auditId, tecnicoId);
    const { itemId, rowId } = await filaManual(auditId);

    const [antes] = await sql<{ value: unknown }[]>`
      SELECT value FROM audit_response WHERE audit_id = ${auditId} AND item_id = ${itemId}
    `;
    await fusionarDispositivo(empresaId, auditId, IDENTIDAD, itemId, rowId, adminId);
    const [despues] = await sql<{ value: unknown }[]>`
      SELECT value FROM audit_response WHERE audit_id = ${auditId} AND item_id = ${itemId}
    `;
    expect(despues.value).toEqual(antes.value);

    await desvincularDispositivo(empresaId, auditId, IDENTIDAD);
    const [final] = await sql<{ value: unknown }[]>`
      SELECT value FROM audit_response WHERE audit_id = ${auditId} AND item_id = ${itemId}
    `;
    expect(final.value).toEqual(antes.value);
  });

  it('desvincularDispositivo → vínculo NULL y sin_revisar sin revisor/fecha (R24)', async () => {
    const { auditId, empresaId, tecnicoId, adminId } = await fixtures('Desvincular SA');
    await grupoEnDosEscaneos(empresaId, auditId, tecnicoId);
    const { itemId, rowId } = await filaManual(auditId);
    await fusionarDispositivo(empresaId, auditId, IDENTIDAD, itemId, rowId, adminId);

    const actualizadas = await desvincularDispositivo(empresaId, auditId, IDENTIDAD);
    expect(actualizadas).toBe(2);

    const filas = await ocurrenciasDelGrupo();
    for (const f of filas) {
      expect(f.revision).toBe('sin_revisar');
      expect(f.relevamiento_item_id).toBeNull();
      expect(f.relevamiento_row_id).toBeNull();
      expect(f.revisado_por).toBeNull();
      expect(f.revisado_at).toBeNull();
    }

    // Desvincular un grupo sin vínculo → not found
    await expect(desvincularDispositivo(empresaId, auditId, IDENTIDAD)).rejects.toMatchObject({
      code: 'ESCANEO_NOT_FOUND'
    });
  });

  it('vínculo roto: se borra la fila del jsonb → el detalle resuelve vivo = false (R25)', async () => {
    const { auditId, empresaId, tecnicoId, adminId } = await fixtures('Vinculo Roto SA');
    await grupoEnDosEscaneos(empresaId, auditId, tecnicoId);
    const { itemId, rowId } = await filaManual(auditId);
    await fusionarDispositivo(empresaId, auditId, IDENTIDAD, itemId, rowId, adminId);

    // El técnico borra la fila desde el form (caso legítimo): update directo del jsonb
    await sql`
      UPDATE audit_response
      SET value = ${sql.json({ rows: [] } as never)}
      WHERE audit_id = ${auditId} AND item_id = ${itemId}
    `;

    const detalle = await obtenerDispositivoConsolidado(empresaId, auditId, IDENTIDAD);
    expect(detalle.revision).toBe('fusionado');
    expect(detalle.vinculo).not.toBeNull();
    expect(detalle.vinculo?.vivo).toBe(false);
    expect(detalle.vinculo?.itemId).toBe(itemId);
    expect(detalle.vinculo?.rowId).toBe(rowId);

    // Re-vincular a una fila nueva o desvincular siguen disponibles
    const nuevaRowId = randomUUID();
    await sql`
      UPDATE audit_response
      SET value = ${sql.json({
        rows: [{ row_id: nuevaRowId, cells: { tipo: 'Servidor' }, attachment_ids: [] }]
      } as never)}
      WHERE audit_id = ${auditId} AND item_id = ${itemId}
    `;
    await fusionarDispositivo(empresaId, auditId, IDENTIDAD, itemId, nuevaRowId, adminId);
    const revinculado = await obtenerDispositivoConsolidado(empresaId, auditId, IDENTIDAD);
    expect(revinculado.vinculo).toMatchObject({ rowId: nuevaRowId, vivo: true });
  });

  it('revertir a sin_revisar limpia revisor y fecha en el grupo (R26)', async () => {
    const { auditId, empresaId, tecnicoId, adminId } = await fixtures('Revertir SA');
    await grupoEnDosEscaneos(empresaId, auditId, tecnicoId);

    await marcarRevisionGrupo(empresaId, auditId, IDENTIDAD, 'confirmado', adminId, 'ok');
    const actualizadas = await marcarRevisionGrupo(
      empresaId,
      auditId,
      IDENTIDAD,
      'sin_revisar',
      adminId
    );
    expect(actualizadas).toBe(2);

    const filas = await ocurrenciasDelGrupo();
    for (const f of filas) {
      expect(f.revision).toBe('sin_revisar');
      expect(f.revisado_por).toBeNull();
      expect(f.revisado_at).toBeNull();
    }
  });

  it("marcarRevisionGrupo con 'fusionado' → ValidationError (R21)", async () => {
    const { auditId, empresaId, tecnicoId, adminId } = await fixtures('Fusion Directa SA');
    await grupoEnDosEscaneos(empresaId, auditId, tecnicoId);

    await expect(
      marcarRevisionGrupo(
        empresaId,
        auditId,
        IDENTIDAD,
        'fusionado' as never,
        adminId
      )
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    const filas = await ocurrenciasDelGrupo();
    expect(filas.every((f) => f.revision === 'sin_revisar')).toBe(true);
  });

  it('revisión no-fusión sobre dispositivo fusionado limpia el vínculo (R20)', async () => {
    const { auditId, empresaId, tecnicoId, adminId } = await fixtures('Limpieza Vinculo SA');
    await grupoEnDosEscaneos(empresaId, auditId, tecnicoId);
    const { itemId, rowId } = await filaManual(auditId);
    await fusionarDispositivo(empresaId, auditId, IDENTIDAD, itemId, rowId, adminId);

    await marcarRevisionGrupo(empresaId, auditId, IDENTIDAD, 'confirmado', adminId);
    const filas = await ocurrenciasDelGrupo();
    for (const f of filas) {
      expect(f.revision).toBe('confirmado');
      expect(f.relevamiento_item_id).toBeNull();
      expect(f.relevamiento_row_id).toBeNull();
    }
  });

  it('CHECK de paridad: relevamiento_row_id sin item_id es imposible a nivel DB (R21)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures('Paridad SA');
    const [esc] = await grupoEnDosEscaneos(empresaId, auditId, tecnicoId);
    const [{ devId }] = await sql<{ devId: string }[]>`
      SELECT id AS "devId" FROM escaneo_dispositivo WHERE escaneo_id = ${esc.id}
    `;

    await expect(
      sql`UPDATE escaneo_dispositivo SET relevamiento_row_id = 'fila-x' WHERE id = ${devId}`
    ).rejects.toThrow(/escaneo_dispositivo_vinculo_ck/);
    await expect(
      sql`
        INSERT INTO escaneo_dispositivo (escaneo_id, identidad, ip, relevamiento_row_id)
        VALUES (${esc.id}, '192.168.99.99', '192.168.99.99', 'fila-y')
      `
    ).rejects.toThrow(/escaneo_dispositivo_vinculo_ck/);
  });
});
