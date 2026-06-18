import { describe, expect, it } from 'vitest';
import { requireReportReadAccess } from '../../src/lib/server/api/guards';
import type { AppUser } from '../../src/lib/server/auth/types';

// #32 — guard de lectura de informes por asignación. Cubre R21, R22, R23.
describe('#32 requireReportReadAccess — por asignación', () => {
  const admin: AppUser = {
    id: 'admin-1',
    email: 'a@x',
    name: 'Admin',
    role: 'admin',
    active: true,
    auditTypes: null
  };
  const itTech: AppUser = {
    id: 'it-1',
    email: 'it@x',
    name: 'IT',
    role: 'tecnico',
    active: true,
    auditTypes: ['it']
  };
  const erpTech: AppUser = {
    id: 'erp-1',
    email: 'erp@x',
    name: 'ERP',
    role: 'tecnico',
    active: true,
    auditTypes: ['erp-tango']
  };
  const aprobado = { status: 'aprobado' };

  function locals(user: AppUser | null): App.Locals {
    return { user } as unknown as App.Locals;
  }

  it('(R21) sin sesión → 401', () => {
    const res = requireReportReadAccess(
      locals(null),
      { assignedTechId: 'it-1', assignedTechIds: ['it-1', 'erp-1'] },
      aprobado
    );
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
  });

  it('(R23) técnico asignado a algún tipo accede al informe aprobado', () => {
    // erpTech está asignado a la auditoría mixta (en assignedTechIds) aunque no es el lead.
    const res = requireReportReadAccess(
      locals(erpTech),
      { assignedTechId: 'it-1', assignedTechIds: ['it-1', 'erp-1'] },
      aprobado
    );
    expect(res).toBe(erpTech);
  });

  it('(R22) técnico NO asignado a la auditoría → 403', () => {
    const otro: AppUser = { ...itTech, id: 'otro-9' };
    const res = requireReportReadAccess(
      locals(otro),
      { assignedTechId: 'it-1', assignedTechIds: ['it-1', 'erp-1'] },
      aprobado
    );
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
  });

  it('(R22) admin siempre accede', () => {
    const res = requireReportReadAccess(
      locals(admin),
      { assignedTechId: 'it-1', assignedTechIds: ['it-1'] },
      null
    );
    expect(res).toBe(admin);
  });

  it('(R23) informe no aprobado → técnico asignado 403', () => {
    const res = requireReportReadAccess(
      locals(itTech),
      { assignedTechId: 'it-1', assignedTechIds: ['it-1', 'erp-1'] },
      { status: 'borrador' }
    );
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(403);
  });

  it('compat: single-type usa assignedTechId aunque assignedTechIds no venga', () => {
    const res = requireReportReadAccess(locals(itTech), { assignedTechId: 'it-1' }, aprobado);
    expect(res).toBe(itTech);
  });
});
