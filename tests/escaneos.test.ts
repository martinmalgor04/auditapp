import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type postgres from 'postgres';
import { setSqlForTests } from '../src/lib/server/db/client';
import {
  cambiarEstadoEscaneo,
  crearEscaneo,
  escaneosColgados,
  listarDispositivos,
  listarEscaneosDeAuditoria,
  marcarRevision,
  obtenerEscaneo,
  registrarConsentimiento,
  upsertDispositivos
} from '../src/lib/server/escaneos/repo';
import {
  dispositivoInput,
  type DispositivoInput
} from '../src/lib/server/escaneos/schemas';
import { findUserIdByEmail } from './helpers/auth';
import { insertTestAuditRow } from './helpers/backoffice';
import { insertTestEmpresa } from './helpers/empresa';
import { setupTestDb, teardownTestDb } from './helpers/db';

const ADMIN = 'admin@serviciosysistemas.com.ar';
const TECNICO = 'facu@serviciosysistemas.com.ar';

function chunk(d: unknown): DispositivoInput {
  return dispositivoInput.parse(d);
}

describe('escaneos — modelo de datos y repositorio (#59)', () => {
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

  async function fixtures(razonSocial = 'Escaneo SA') {
    const { auditId, clientId: empresaId } = await insertTestAuditRow(sql, { razonSocial });
    const tecnicoId = await findUserIdByEmail(sql, TECNICO);
    return { auditId, empresaId, tecnicoId };
  }

  async function escaneoEnCurso(empresaId: string, auditId: string, tecnicoId: string) {
    const esc = await crearEscaneo(empresaId, tecnicoId, {
      auditId,
      rangoObjetivo: '192.168.10.0/24',
      agenteVersion: '0.1.0',
      consentimientoPor: 'CTO del cliente',
      consentimientoAt: new Date('2026-08-20T10:00:00Z')
    });
    await cambiarEstadoEscaneo(empresaId, esc.id, 'en_curso');
    return esc;
  }

  it('happy path: crea escaneo con consentimiento y persiste chunk completo (R1,R2,R6,R11,R16,R17,R19,R21,R25,R26,R28)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();
    const antes = new Date();

    const esc = await crearEscaneo(empresaId, tecnicoId, {
      auditId,
      etiqueta: 'VLAN administración',
      rangoObjetivo: '192.168.10.0/24',
      agenteVersion: '0.1.0',
      agenteHostname: 'notebook-facu',
      consentimientoPor: 'CTO del cliente',
      consentimientoAt: new Date('2026-08-20T10:00:00Z')
    });

    // R1/R2: asociado a la auditoría, con rango, técnico, versión y created_at
    expect(esc.audit_id).toBe(auditId);
    expect(esc.tecnico_id).toBe(tecnicoId);
    expect(esc.rango_objetivo).toBe('192.168.10.0/24');
    expect(esc.agente_version).toBe('0.1.0');
    expect(esc.estado).toBe('pendiente');
    expect(esc.consentimiento_otorgado).toBe(true);
    // Tolerancia de 2s: created_at lo pone el reloj de Postgres, `antes` el del proceso
    expect(esc.created_at.getTime()).toBeGreaterThanOrEqual(antes.getTime() - 2000);
    expect(esc.created_at.getTime()).toBeLessThanOrEqual(Date.now() + 2000);

    // R1: auditoría de otra empresa → AUDIT_NOT_FOUND, sin escribir
    const otraEmpresa = await insertTestEmpresa(sql, { razonSocial: 'Ajena SA' });
    await expect(
      crearEscaneo(otraEmpresa, tecnicoId, {
        auditId,
        rangoObjetivo: '10.0.0.0/24',
        agenteVersion: '0.1.0'
      })
    ).rejects.toMatchObject({ code: 'AUDIT_NOT_FOUND' });

    await cambiarEstadoEscaneo(empresaId, esc.id, 'en_curso');

    // R16: el schema rechaza tipos fuera del conjunto
    expect(() => chunk({ ip: '192.168.10.9', tipo: 'tablet' })).toThrow();

    await upsertDispositivos(empresaId, esc.id, [
      chunk({
        mac: 'AA:BB:CC:DD:EE:01',
        ip: '192.168.10.5',
        hostname: 'srv-01',
        tipo: 'servidor',
        soNombre: 'Debian 12',
        memoriaMb: 8192,
        software: [{ nombre: 'nginx', version: '1.24', publisher: 'nginx.org' }],
        servicios: [{ puerto: 443, protocolo: 'tcp', estadoPuerto: 'open', servicio: 'https' }]
      }),
      chunk({ ip: '192.168.10.44' })
    ]);

    const detalle = await obtenerEscaneo(empresaId, esc.id);
    // R28: conteo real tras el chunk
    expect(detalle.dispositivos_detectados).toBe(2);
    expect(detalle.metricas.software).toBe(1);
    expect(detalle.metricas.servicios).toBe(1);

    const { items, total } = await listarDispositivos(empresaId, esc.id);
    expect(total).toBe(2);

    const srv = items.find((d) => d.hostname === 'srv-01')!;
    // R11: dispositivo asociado al escaneo
    expect(srv.escaneo_id).toBe(esc.id);
    // R16: tipo dentro del conjunto
    expect(srv.tipo).toBe('servidor');
    // R25: estado de revisión expuesto en la lectura
    expect(srv.revision).toBe('sin_revisar');

    const [sw] = await sql<{ dispositivo_id: string; nombre: string }[]>`
      SELECT dispositivo_id, nombre FROM escaneo_software WHERE dispositivo_id = ${srv.id}
    `;
    // R19: software asociado al dispositivo
    expect(sw.dispositivo_id).toBe(srv.id);
    expect(sw.nombre).toBe('nginx');

    const [svc] = await sql<
      { dispositivo_id: string; puerto: number; protocolo: string; estado_puerto: string }[]
    >`
      SELECT dispositivo_id, puerto, protocolo, estado_puerto
      FROM escaneo_servicio WHERE dispositivo_id = ${srv.id}
    `;
    // R21: servicio asociado al dispositivo con puerto, protocolo y estado
    expect(svc.dispositivo_id).toBe(srv.id);
    expect([svc.puerto, svc.protocolo, svc.estado_puerto]).toEqual([443, 'tcp', 'open']);

    // R17: campos no provistos persisten NULL (sin defaults sintéticos)
    const pelado = items.find((d) => d.ip === '192.168.10.44')!;
    expect(pelado.hostname).toBeNull();
    expect(pelado.fabricante).toBeNull();
    expect(pelado.memoria_mb).toBeNull();
    expect(pelado.mac).toBeNull();

    // R6: múltiples escaneos por auditoría
    const esc2 = await crearEscaneo(empresaId, tecnicoId, {
      auditId,
      etiqueta: 'VLAN depósito',
      rangoObjetivo: '192.168.20.0/24',
      agenteVersion: '0.1.0'
    });
    const listado = await listarEscaneosDeAuditoria(empresaId, auditId);
    expect(listado.map((e) => e.id).sort()).toEqual([esc.id, esc2.id].sort());

    // R26: el filtro de empresa se aplica en lecturas
    expect(await listarEscaneosDeAuditoria(otraEmpresa, auditId)).toEqual([]);
    await expect(obtenerEscaneo(otraEmpresa, esc.id)).rejects.toMatchObject({
      code: 'ESCANEO_NOT_FOUND'
    });
  });

  it('sin consentimiento queda pendiente; en_curso lo exige en app y en DB (R3,R8,R9)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();

    const esc = await crearEscaneo(empresaId, tecnicoId, {
      auditId,
      rangoObjetivo: '192.168.10.0/24',
      agenteVersion: '0.1.0'
    });
    // R3: estado inicial dentro del conjunto
    expect(esc.estado).toBe('pendiente');
    expect(esc.consentimiento_otorgado).toBe(false);

    // R8: transición a en_curso rechazada sin consentimiento
    await expect(cambiarEstadoEscaneo(empresaId, esc.id, 'en_curso')).rejects.toMatchObject({
      code: 'CONSENTIMIENTO_FALTANTE'
    });

    // R9: la base garantiza el consentimiento completo a nivel CHECK
    await expect(
      sql`UPDATE escaneo SET estado = 'en_curso' WHERE id = ${esc.id}`
    ).rejects.toThrow(/escaneo_consentimiento_ck/);

    // Tras registrar consentimiento, la transición se permite
    await registrarConsentimiento(empresaId, esc.id, {
      consentimientoPor: 'CTO del cliente',
      consentimientoAt: new Date('2026-08-21T09:00:00Z')
    });
    const enCurso = await cambiarEstadoEscaneo(empresaId, esc.id, 'en_curso');
    expect(enCurso.estado).toBe('en_curso');
    expect(enCurso.iniciado_at).not.toBeNull();
    expect(enCurso.consentimiento_por).toBe('CTO del cliente');
  });

  it('mismo dispositivo dos veces actualiza sin duplicar; software y servicio deduplican (R12,R13,R20,R22)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();
    const esc = await escaneoEnCurso(empresaId, auditId, tecnicoId);

    await upsertDispositivos(empresaId, esc.id, [
      chunk({
        mac: 'AA:BB:CC:DD:EE:02',
        ip: '192.168.10.6',
        hostname: 'srv-02',
        software: [{ nombre: 'nginx', version: '1.24' }],
        servicios: [{ puerto: 22, estadoPuerto: 'open', version: '9.2' }]
      }),
      chunk({ ip: '192.168.10.77', hostname: 'sin-mac' })
    ]);

    // R12: identidad determinística — mac normalizada si hay mac, ip si no
    const [{ identidad: idConMac }] = await sql<{ identidad: string }[]>`
      SELECT identidad FROM escaneo_dispositivo WHERE escaneo_id = ${esc.id} AND hostname = 'srv-02'
    `;
    expect(idConMac).toBe('aabbccddee02');
    const [{ identidad: idSinMac }] = await sql<{ identidad: string }[]>`
      SELECT identidad FROM escaneo_dispositivo WHERE escaneo_id = ${esc.id} AND hostname = 'sin-mac'
    `;
    expect(idSinMac).toBe('192.168.10.77');

    // Reenvío del mismo dispositivo (misma identidad) con datos nuevos
    await upsertDispositivos(empresaId, esc.id, [
      chunk({
        mac: 'aa:bb:cc:dd:ee:02',
        ip: '192.168.10.6',
        hostname: 'srv-02b',
        software: [{ nombre: 'nginx', version: '1.24' }],
        servicios: [{ puerto: 22, estadoPuerto: 'filtered', version: '9.8' }]
      })
    ]);

    const { items, total } = await listarDispositivos(empresaId, esc.id);
    // R13: actualiza, no duplica
    expect(total).toBe(2);
    const srv = items.find((d) => d.mac === 'aabbccddee02')!;
    expect(srv.hostname).toBe('srv-02b');

    // R20: software idéntico re-insertado se ignora
    const [{ n: nSw }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM escaneo_software WHERE dispositivo_id = ${srv.id}
    `;
    expect(nSw).toBe(1);

    // R22: servicio (puerto, protocolo) único; actualiza estado y versión
    const [svc] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM escaneo_servicio WHERE dispositivo_id = ${srv.id}
    `;
    expect(svc.n).toBe(1);
    const [svcRow] = await sql<{ estado_puerto: string; version: string }[]>`
      SELECT estado_puerto, version FROM escaneo_servicio WHERE dispositivo_id = ${srv.id}
    `;
    expect([svcRow.estado_puerto, svcRow.version]).toEqual(['filtered', '9.8']);
  });

  it('software sin versión reenviado se ignora: NULLS NOT DISTINCT en la UNIQUE (R20)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();
    const esc = await escaneoEnCurso(empresaId, auditId, tecnicoId);

    // Caso común en Open-AudIT: software detectado sin versión
    await upsertDispositivos(empresaId, esc.id, [
      chunk({ ip: '192.168.10.90', software: [{ nombre: 'Tango Gestión', version: null }] })
    ]);
    await upsertDispositivos(empresaId, esc.id, [
      chunk({ ip: '192.168.10.90', software: [{ nombre: 'Tango Gestión', version: null }] })
    ]);

    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM escaneo_software s
      JOIN escaneo_dispositivo d ON d.id = s.dispositivo_id
      WHERE d.escaneo_id = ${esc.id} AND s.nombre = 'Tango Gestión' AND s.version IS NULL
    `;
    expect(n).toBe(1);

    // La DB sola también lo garantiza (sin ON CONFLICT)
    const [dev] = await sql<{ id: string }[]>`
      SELECT id FROM escaneo_dispositivo WHERE escaneo_id = ${esc.id}
    `;
    await expect(
      sql`INSERT INTO escaneo_software (dispositivo_id, nombre, version) VALUES (${dev.id}, 'Tango Gestión', NULL)`
    ).rejects.toThrow(/escaneo_software_uq/);
  });

  it('campo en NULL entrante conserva el valor previo (R18)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();
    const esc = await escaneoEnCurso(empresaId, auditId, tecnicoId);

    await upsertDispositivos(empresaId, esc.id, [
      chunk({
        mac: 'AA:BB:CC:DD:EE:03',
        ip: '192.168.10.7',
        hostname: 'srv-03',
        tipo: 'servidor',
        soNombre: 'Debian 12',
        fabricante: 'Dell'
      })
    ]);

    // Segundo chunk sin esos campos (NULL tras parse)
    await upsertDispositivos(empresaId, esc.id, [
      chunk({ mac: 'AA:BB:CC:DD:EE:03', ip: '192.168.10.7', modelo: 'PowerEdge R750' })
    ]);

    const { items } = await listarDispositivos(empresaId, esc.id);
    const srv = items[0];
    expect(srv.hostname).toBe('srv-03');
    expect(srv.so_nombre).toBe('Debian 12');
    expect(srv.fabricante).toBe('Dell');
    // El default 'desconocido' del schema tampoco pisa un tipo conocido
    expect(srv.tipo).toBe('servidor');
    // Lo que sí llega con valor, actualiza
    expect(srv.modelo).toBe('PowerEdge R750');
  });

  it('normaliza MAC con separadores/mayúsculas y rechaza MAC inválida (R15)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();
    const esc = await escaneoEnCurso(empresaId, auditId, tecnicoId);

    await upsertDispositivos(empresaId, esc.id, [
      chunk({ mac: 'AA-BB-CC-DD-EE-0A', ip: '192.168.10.10' }),
      chunk({ mac: 'aabb.ccdd.ee0b', ip: '192.168.10.11' })
    ]);

    const macs = (await listarDispositivos(empresaId, esc.id)).items.map((d) => d.mac).sort();
    expect(macs).toEqual(['aabbccddee0a', 'aabbccddee0b']);

    // Schema: no normaliza a 12 hex → rechazo
    expect(() => chunk({ mac: 'ZZ:ZZ:ZZ', ip: '192.168.10.12' })).toThrow();
    expect(() => chunk({ mac: 'aabbccddee0f00', ip: '192.168.10.12' })).toThrow();

    // DB: el CHECK es la segunda línea de defensa
    await expect(
      sql`
        INSERT INTO escaneo_dispositivo (escaneo_id, identidad, mac, ip)
        VALUES (${esc.id}, '192.168.10.99', 'no-es-mac', '192.168.10.99')
      `
    ).rejects.toThrow(/escaneo_dispositivo_mac_ck/);
  });

  it('upsertDispositivos con empresaId ajeno es rechazado sin escribir nada (R27)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();
    const esc = await escaneoEnCurso(empresaId, auditId, tecnicoId);
    const otraEmpresa = await insertTestEmpresa(sql, { razonSocial: 'Intrusa SA' });

    await expect(
      upsertDispositivos(otraEmpresa, esc.id, [chunk({ ip: '192.168.10.20' })])
    ).rejects.toMatchObject({ code: 'ESCANEO_NO_MUTABLE' });

    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM escaneo_dispositivo WHERE escaneo_id = ${esc.id}
    `;
    expect(n).toBe(0);
    expect((await obtenerEscaneo(empresaId, esc.id)).dispositivos_detectados).toBe(0);
  });

  it('upsertDispositivos sobre escaneo completado es rechazado sin escribir nada (R4)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();
    const esc = await escaneoEnCurso(empresaId, auditId, tecnicoId);
    await cambiarEstadoEscaneo(empresaId, esc.id, 'sincronizando');
    await cambiarEstadoEscaneo(empresaId, esc.id, 'completado');

    await expect(
      upsertDispositivos(empresaId, esc.id, [chunk({ ip: '192.168.10.21' })])
    ).rejects.toMatchObject({ code: 'ESCANEO_NO_MUTABLE' });

    const [{ n }] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM escaneo_dispositivo WHERE escaneo_id = ${esc.id}
    `;
    expect(n).toBe(0);
  });

  it('borrar la auditoría elimina en cascada escaneo, dispositivos, software y servicios (R5)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();
    const esc = await escaneoEnCurso(empresaId, auditId, tecnicoId);
    await upsertDispositivos(empresaId, esc.id, [
      chunk({
        ip: '192.168.10.30',
        software: [{ nombre: 'nginx', version: '1.24' }],
        servicios: [{ puerto: 80 }]
      })
    ]);
    const { items } = await listarDispositivos(empresaId, esc.id);
    const devId = items[0].id;

    await sql`DELETE FROM audit WHERE id = ${auditId}`;

    const conteos = await sql<{ tabla: string; n: number }[]>`
      SELECT 'escaneo' AS tabla, count(*)::int AS n FROM escaneo WHERE id = ${esc.id}
      UNION ALL
      SELECT 'dispositivo', count(*)::int FROM escaneo_dispositivo WHERE id = ${devId}
      UNION ALL
      SELECT 'software', count(*)::int FROM escaneo_software WHERE dispositivo_id = ${devId}
      UNION ALL
      SELECT 'servicio', count(*)::int FROM escaneo_servicio WHERE dispositivo_id = ${devId}
    `;
    for (const c of conteos) {
      expect(c.n, `tabla ${c.tabla}`).toBe(0);
    }
  });

  it('transición inválida es rechazada sin mutar el escaneo; estados fuera del conjunto no entran (R3,R10)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();
    const esc = await escaneoEnCurso(empresaId, auditId, tecnicoId);

    // sincronizando → en_curso no existe en la máquina
    await cambiarEstadoEscaneo(empresaId, esc.id, 'sincronizando');
    await expect(
      cambiarEstadoEscaneo(empresaId, esc.id, 'en_curso')
    ).rejects.toMatchObject({ code: 'TRANSICION_INVALIDA' });

    // pendiente → completado, desde un escaneo nuevo
    const esc2 = await crearEscaneo(empresaId, tecnicoId, {
      auditId,
      rangoObjetivo: '192.168.30.0/24',
      agenteVersion: '0.1.0'
    });
    await expect(
      cambiarEstadoEscaneo(empresaId, esc2.id, 'completado')
    ).rejects.toMatchObject({ code: 'TRANSICION_INVALIDA' });
    // Sin mutar
    expect((await obtenerEscaneo(empresaId, esc2.id)).estado).toBe('pendiente');

    // Estados terminales no reabren
    await cambiarEstadoEscaneo(empresaId, esc2.id, 'cancelado');
    await expect(
      cambiarEstadoEscaneo(empresaId, esc2.id, 'en_curso')
    ).rejects.toMatchObject({ code: 'TRANSICION_INVALIDA' });

    // R3: la DB rechaza estados fuera del conjunto
    await expect(
      sql`UPDATE escaneo SET estado = 'revisando' WHERE id = ${esc.id}`
    ).rejects.toThrow(/escaneo_estado_check/);
  });

  it('dos upserts concurrentes sobre el mismo escaneo no duplican ni deadlockean (R13)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();
    const esc = await escaneoEnCurso(empresaId, auditId, tecnicoId);

    const chunkA = [
      chunk({ mac: 'AA:BB:CC:DD:EE:40', ip: '192.168.10.40', hostname: 'compartido' }),
      chunk({ mac: 'AA:BB:CC:DD:EE:41', ip: '192.168.10.41' })
    ];
    const chunkB = [
      chunk({ mac: 'aa:bb:cc:dd:ee:40', ip: '192.168.10.40', soNombre: 'Debian 12' }),
      chunk({ mac: 'AA:BB:CC:DD:EE:42', ip: '192.168.10.42' })
    ];

    await Promise.all([
      upsertDispositivos(empresaId, esc.id, chunkA),
      upsertDispositivos(empresaId, esc.id, chunkB)
    ]);

    const { items, total } = await listarDispositivos(empresaId, esc.id);
    expect(total).toBe(3);
    expect(new Set(items.map((d) => d.identidad)).size).toBe(3);

    const compartido = items.find((d) => d.mac === 'aabbccddee40')!;
    expect(compartido.hostname).toBe('compartido');
    expect(compartido.so_nombre).toBe('Debian 12');

    expect((await obtenerEscaneo(empresaId, esc.id)).dispositivos_detectados).toBe(3);
  });

  it('dispositivos_detectados refleja el conteo real tras cada chunk (R28)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();
    const esc = await escaneoEnCurso(empresaId, auditId, tecnicoId);

    await upsertDispositivos(empresaId, esc.id, [
      chunk({ ip: '192.168.10.50' }),
      chunk({ ip: '192.168.10.51' })
    ]);
    expect((await obtenerEscaneo(empresaId, esc.id)).dispositivos_detectados).toBe(2);

    await upsertDispositivos(empresaId, esc.id, [chunk({ ip: '192.168.10.52' })]);
    expect((await obtenerEscaneo(empresaId, esc.id)).dispositivos_detectados).toBe(3);

    // Reenvío de uno existente: el conteo no crece
    await upsertDispositivos(empresaId, esc.id, [
      chunk({ ip: '192.168.10.50', hostname: 'renombrado' })
    ]);
    expect((await obtenerEscaneo(empresaId, esc.id)).dispositivos_detectados).toBe(3);
  });

  it('escaneosColgados expone solo >24h en en_curso/sincronizando (R7)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();

    const colgadoEnCurso = await escaneoEnCurso(empresaId, auditId, tecnicoId);
    const reciente = await escaneoEnCurso(empresaId, auditId, tecnicoId);
    const colgadoSincronizando = await escaneoEnCurso(empresaId, auditId, tecnicoId);
    await cambiarEstadoEscaneo(empresaId, colgadoSincronizando.id, 'sincronizando');
    const pendienteViejo = await crearEscaneo(empresaId, tecnicoId, {
      auditId,
      rangoObjetivo: '192.168.40.0/24',
      agenteVersion: '0.1.0'
    });

    await sql`
      UPDATE escaneo SET updated_at = now() - interval '25 hours'
      WHERE id IN (${colgadoEnCurso.id}, ${colgadoSincronizando.id}, ${pendienteViejo.id})
    `;

    const colgados = await escaneosColgados();
    const ids = colgados.map((e) => e.id);
    expect(ids).toContain(colgadoEnCurso.id);
    expect(ids).toContain(colgadoSincronizando.id);
    expect(ids).not.toContain(reciente.id);
    // pendiente no es candidato aunque supere las 24h
    expect(ids).not.toContain(pendienteViejo.id);
  });

  it('marcarRevision registra quién y cuándo; el CHECK exige revisor (R23,R24,R25)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();
    const adminId = await findUserIdByEmail(sql, ADMIN);
    const esc = await escaneoEnCurso(empresaId, auditId, tecnicoId);
    await upsertDispositivos(empresaId, esc.id, [
      chunk({ ip: '192.168.10.60' }),
      chunk({ ip: '192.168.10.61' })
    ]);
    const { items } = await listarDispositivos(empresaId, esc.id);
    const [dev, otro] = items;

    // R23: default sin_revisar, sin revisor
    expect(dev.revision).toBe('sin_revisar');
    expect(dev.revisado_por).toBeNull();
    expect(dev.revisado_at).toBeNull();

    // R24: al confirmar registra quién y cuándo
    const revisado = await marcarRevision(empresaId, dev.id, 'confirmado', adminId, 'Verificado en sitio');
    expect(revisado.revision).toBe('confirmado');
    expect(revisado.revisado_por).toBe(adminId);
    expect(revisado.revisado_at).not.toBeNull();
    expect(revisado.nota_tecnico).toBe('Verificado en sitio');

    // Volver a sin_revisar limpia el revisor
    const revertido = await marcarRevision(empresaId, dev.id, 'sin_revisar', adminId);
    expect(revertido.revisado_por).toBeNull();
    expect(revertido.revisado_at).toBeNull();

    // R24: la DB impide revisión distinta de sin_revisar sin revisor
    await expect(
      sql`UPDATE escaneo_dispositivo SET revision = 'confirmado' WHERE id = ${otro.id}`
    ).rejects.toThrow(/escaneo_dispositivo_revision_ck/);

    // R25: el estado de revisión es filtrable en la lectura
    await marcarRevision(empresaId, otro.id, 'descartado', adminId);
    const confirmados = await listarDispositivos(empresaId, esc.id, { revision: 'confirmado' });
    expect(confirmados.total).toBe(0);
    const descartados = await listarDispositivos(empresaId, esc.id, { revision: 'descartado' });
    expect(descartados.total).toBe(1);
    expect(descartados.items[0].id).toBe(otro.id);

    // Scope de empresa también en marcarRevision
    const otraEmpresa = await insertTestEmpresa(sql, { razonSocial: 'Ajena 2 SA' });
    await expect(
      marcarRevision(otraEmpresa, otro.id, 'confirmado', adminId)
    ).rejects.toMatchObject({ code: 'ESCANEO_NOT_FOUND' });
  });

  it('raw se persiste sin transformación y es consultable vía GIN (R14)', async () => {
    const { auditId, empresaId, tecnicoId } = await fixtures();
    const esc = await escaneoEnCurso(empresaId, auditId, tecnicoId);

    const payload = {
      open_audit: { id: 42, discovery: 'snmp' },
      puertos_extra: [9100, 515],
      anidado: { profundo: { valor: true } },
      texto: 'impressão ñandú'
    };
    await upsertDispositivos(empresaId, esc.id, [
      chunk({ ip: '192.168.10.70', raw: payload })
    ]);

    const { items } = await listarDispositivos(empresaId, esc.id);
    expect(items[0].raw).toEqual(payload);

    // Consultable por contenido (índice GIN)
    const encontrados = await sql<{ id: string }[]>`
      SELECT id FROM escaneo_dispositivo
      WHERE escaneo_id = ${esc.id}
        AND raw @> ${sql.json({ anidado: { profundo: { valor: true } } } as never)}
    `;
    expect(encontrados.map((r) => r.id)).toEqual([items[0].id]);
  });
});
