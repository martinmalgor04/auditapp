import { BackofficeError } from '$lib/server/backoffice/errors';

export class ClosureValidationError extends BackofficeError {
  readonly fields?: Record<string, string>;

  constructor(message = 'Datos de cierre inválidos', fields?: Record<string, string>) {
    super('CLOSURE_VALIDATION', message, 400);
    this.name = 'ClosureValidationError';
    this.fields = fields;
  }
}

export class InvalidAuditStateError extends BackofficeError {
  constructor(message = 'Estado de auditoría no válido para esta acción') {
    super('INVALID_AUDIT_STATE', message, 409);
    this.name = 'InvalidAuditStateError';
  }
}
