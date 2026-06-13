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
