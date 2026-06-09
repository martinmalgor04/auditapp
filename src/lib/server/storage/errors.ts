export class StorageValidationError extends Error {
  readonly code = 'STORAGE_VALIDATION_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'StorageValidationError';
  }
}

export class AttachmentNotFoundError extends Error {
  readonly code = 'ATTACHMENT_NOT_FOUND';

  constructor(message = 'Adjunto no encontrado') {
    super(message);
    this.name = 'AttachmentNotFoundError';
  }
}

export class AuditNotFoundError extends Error {
  readonly code = 'AUDIT_NOT_FOUND';

  constructor(message = 'Auditoría no encontrada') {
    super(message);
    this.name = 'AuditNotFoundError';
  }
}

export class AttachmentConflictError extends Error {
  readonly code = 'CONFLICT';

  constructor(message = 'El adjunto ya existe') {
    super(message);
    this.name = 'AttachmentConflictError';
  }
}
