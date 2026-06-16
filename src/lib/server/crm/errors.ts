export class CrmInvalidTransitionError extends Error {
  readonly code = 'CRM_INVALID_TRANSITION';

  constructor(from: string, to: string) {
    super(`Transición inválida de ${from} a ${to}`);
    this.name = 'CrmInvalidTransitionError';
  }
}

export class CrmLeadNotFoundError extends Error {
  readonly code = 'CRM_LEAD_NOT_FOUND';

  constructor(id?: string) {
    super(id ? `Lead no encontrado: ${id}` : 'Lead no encontrado');
    this.name = 'CrmLeadNotFoundError';
  }
}

export class CrmLeadDiscardedError extends Error {
  readonly code = 'CRM_LEAD_DISCARDED';

  constructor() {
    super('No se puede modificar un lead descartado');
    this.name = 'CrmLeadDiscardedError';
  }
}

/** #23 Fase 4 (R19): empresa inexistente en la ficha o en el endpoint de update. */
export class EmpresaNotFoundError extends Error {
  readonly code = 'EMPRESA_NOT_FOUND';

  constructor(id?: string) {
    super(id ? `Empresa no encontrada: ${id}` : 'Empresa no encontrada');
    this.name = 'EmpresaNotFoundError';
  }
}
