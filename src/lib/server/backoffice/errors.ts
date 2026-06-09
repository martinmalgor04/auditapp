export class BackofficeError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'BackofficeError';
    this.code = code;
    this.status = status;
  }
}

export class ForbiddenError extends BackofficeError {
  constructor(message = 'No tenés permiso para esta acción') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

export class AuditNotFoundError extends BackofficeError {
  constructor(message = 'Auditoría no encontrada') {
    super('AUDIT_NOT_FOUND', message, 404);
    this.name = 'AuditNotFoundError';
  }
}

export class AuditClosedError extends BackofficeError {
  constructor(message = 'La auditoría está cerrada y no se puede editar') {
    super('AUDIT_CLOSED', message, 409);
    this.name = 'AuditClosedError';
  }
}

export class InvalidStateTransitionError extends BackofficeError {
  constructor(message = 'Transición de estado no permitida') {
    super('INVALID_STATE', message, 409);
    this.name = 'InvalidStateTransitionError';
  }
}

export class ValidationError extends BackofficeError {
  constructor(message = 'Datos inválidos') {
    super('VALIDATION_ERROR', message, 400);
    this.name = 'ValidationError';
  }
}
