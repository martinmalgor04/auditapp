import { describe, expect, it } from 'vitest';
import { buildEmpresaCode, formatRefCode } from '../../src/lib/server/clients/normalize';

describe('buildEmpresaCode (#41 R1–R2)', () => {
  it('INGENIERIA SIGLO XXI → ISX', () => {
    expect(buildEmpresaCode('INGENIERIA SIGLO XXI')).toBe('ISX');
  });

  it('GRUPO AGROS FORMOSA SA → GAF', () => {
    expect(buildEmpresaCode('GRUPO AGROS FORMOSA SA')).toBe('GAF');
  });

  it('bases distintas para razones sociales diferentes (sin colisión en DB)', () => {
    expect(buildEmpresaCode('Empresa Alpha SA')).toBe('EAM');
    expect(buildEmpresaCode('Empresa Beta SRL')).toBe('EBM');
  });

  it('mínimo 3 chars completando desde primer token', () => {
    expect(buildEmpresaCode('ABC SA')).toBe('ABC');
  });

  it('formatRefCode compone EMPRESA-TIPO-NNNN', () => {
    expect(formatRefCode('ISX', 'erp-tango', 2)).toBe('ISX-ERP-0002');
    expect(formatRefCode('ISX', 'it', 1)).toBe('ISX-IT-0001');
    expect(formatRefCode('ISX', 'erp-estandar', 12)).toBe('ISX-ERPE-0012');
  });
});
