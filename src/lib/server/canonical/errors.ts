export class AuditNotClosedError extends Error {
  readonly code = 'AUDIT_NOT_CLOSED';

  constructor(message = 'La auditoría no está cerrada') {
    super(message);
    this.name = 'AuditNotClosedError';
  }
}

export class CanonicalBuildError extends Error {
  readonly code = 'CANONICAL_BUILD_ERROR';

  constructor(message = 'Error al construir el contrato canónico') {
    super(message);
    this.name = 'CanonicalBuildError';
  }
}
