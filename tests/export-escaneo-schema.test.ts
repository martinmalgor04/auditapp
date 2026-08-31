import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import {
  buildDispositivoInputSchema,
  exportDispositivoInputSchema,
  SCHEMA_OUTPUT_PATH
} from '../scripts/export-escaneo-schema';
import { dispositivoInput } from '../src/lib/server/escaneos/schemas';

function buildAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

/** Dispositivo ya normalizado por el agente (MAC 12 hex minúsculas). */
function dispositivoValido() {
  return {
    ip: '192.168.1.50',
    mac: 'aabbccddeeff',
    hostname: 'pc-recepcion',
    tipo: 'workstation',
    soFamilia: 'Windows',
    soNombre: 'Windows 11 Pro',
    memoriaMb: 16384,
    discoTotalGb: 512,
    vistoAt: '2026-08-31T12:00:00.000Z',
    fuente: 'open-audit',
    raw: { source: 'fixture' },
    software: [{ nombre: 'Tango Gestión', version: '19.1', raw: {} }],
    servicios: [{ puerto: 445, protocolo: 'tcp', estadoPuerto: 'open', servicio: 'microsoft-ds', raw: {} }]
  };
}

describe('export-escaneo-schema (#61 T1, R25)', () => {
  it('genera JSON Schema draft-07 autocontenido con ip requerida y enums inline', () => {
    const schema = buildDispositivoInputSchema();
    const root = schema.definitions?.DispositivoInput as {
      required?: string[];
      properties: Record<string, { enum?: string[] }>;
    };

    expect(schema.$ref).toBe('#/definitions/DispositivoInput');
    expect(root.required).toEqual(['ip']);
    expect(root.properties.tipo.enum).toContain('desconocido');
    expect(root.properties.tipo.enum).toHaveLength(14);
  });

  it('inyecta el patrón de MAC normalizada (12 hex minúsculas)', () => {
    const schema = buildDispositivoInputSchema();
    const mac = (schema.definitions?.DispositivoInput as never as {
      properties: { mac: { anyOf: { type: string; pattern?: string }[] } };
    }).properties.mac;

    const stringBranch = mac.anyOf.find((b) => b.type === 'string');
    expect(stringBranch?.pattern).toBe('^[0-9a-f]{12}$');
  });

  it('el schema exportado valida con Ajv: acepta un dispositivo válido', () => {
    const ajv = buildAjv();
    const validate = ajv.compile(buildDispositivoInputSchema());

    expect(validate(dispositivoValido())).toBe(true);
  });

  it.each([
    ['sin ip', { mac: 'aabbccddeeff' }],
    ['ip malformada', { ip: 'no-es-una-ip' }],
    ['tipo fuera de enum', { ip: '192.168.1.50', tipo: 'mainframe' }],
    ['puerto fuera de rango', { ip: '192.168.1.50', servicios: [{ puerto: 70000 }] }],
    ['software sin nombre', { ip: '192.168.1.50', software: [{ version: '1.0' }] }]
  ])('rechaza igual que Zod: %s', (_nombre, payload) => {
    const ajv = buildAjv();
    const validate = ajv.compile(buildDispositivoInputSchema());

    expect(validate(payload)).toBe(false);
    expect(dispositivoInput.safeParse(payload).success).toBe(false);
  });

  it.each([
    ['mac sin normalizar (mayúsculas)', 'AABBCCDDEEFF'],
    ['mac con separadores', 'aa:bb:cc:dd:ee:ff']
  ])(
    'MAC %s: el schema del agente rechaza (exige normalización previa) y Zod normaliza y acepta',
    (_nombre, mac) => {
      const ajv = buildAjv();
      const validate = ajv.compile(buildDispositivoInputSchema());

      // El agente valida DESPUÉS de normalizar (R25): el schema frena una MAC
      // que no pasó por la normalización de #59 R15.
      expect(validate({ ip: '192.168.1.50', mac })).toBe(false);

      // El server sigue siendo la autoridad tolerante: normaliza y acepta.
      const parsed = dispositivoInput.safeParse({ ip: '192.168.1.50', mac });
      expect(parsed.success).toBe(true);
      expect(parsed.data?.mac).toBe('aabbccddeeff');
    }
  );

  it('todo payload válido para el schema del agente es aceptado por Zod', () => {
    const ajv = buildAjv();
    const validate = ajv.compile(buildDispositivoInputSchema());
    const payload = dispositivoValido();

    expect(validate(payload)).toBe(true);
    expect(dispositivoInput.safeParse(payload).success).toBe(true);
  });

  it('escribe el archivo en static/agente y el contenido es el schema generado', () => {
    const outputPath = exportDispositivoInputSchema();

    expect(outputPath).toBe(resolve(process.cwd(), SCHEMA_OUTPUT_PATH));
    expect(existsSync(outputPath)).toBe(true);

    const fromDisk = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(fromDisk).toEqual(JSON.parse(JSON.stringify(buildDispositivoInputSchema())));
  });
});
