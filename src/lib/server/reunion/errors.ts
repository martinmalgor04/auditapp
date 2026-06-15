export class ReunionNotAllowedError extends Error {
  readonly code = 'REUNION_NOT_ALLOWED';
  readonly httpStatus = 403;

  constructor(message = 'No tenés permiso para esta sesión de reunión') {
    super(message);
    this.name = 'ReunionNotAllowedError';
  }
}

export class ReunionAuditNotEditableError extends Error {
  readonly code = 'REUNION_AUDIT_NOT_EDITABLE';
  readonly httpStatus = 400;

  constructor(message = 'La auditoría no está en un estado editable') {
    super(message);
    this.name = 'ReunionAuditNotEditableError';
  }
}

export class ReunionConsentRequiredError extends Error {
  readonly code = 'REUNION_CONSENT_REQUIRED';
  readonly httpStatus = 400;

  constructor(message = 'Se requiere registrar el consentimiento antes de subir audio') {
    super(message);
    this.name = 'ReunionConsentRequiredError';
  }
}

export class ReunionSessionNotFoundError extends Error {
  readonly code = 'REUNION_SESSION_NOT_FOUND';
  readonly httpStatus = 404;

  constructor(message = 'Sesión de reunión no encontrada') {
    super(message);
    this.name = 'ReunionSessionNotFoundError';
  }
}

export class ReunionPipelineError extends Error {
  readonly code = 'REUNION_PIPELINE_ERROR';
  readonly httpStatus = 500;

  constructor(message = 'Error en el pipeline de procesamiento') {
    super(message);
    this.name = 'ReunionPipelineError';
  }
}

export class ReunionProposalNotFoundError extends Error {
  readonly code = 'REUNION_PROPOSAL_NOT_FOUND';
  readonly httpStatus = 404;

  constructor(message = 'Propuesta de reunión no encontrada') {
    super(message);
    this.name = 'ReunionProposalNotFoundError';
  }
}

export class ReunionProposalValidationError extends Error {
  readonly code = 'REUNION_PROPOSAL_INVALID';
  readonly httpStatus = 400;

  constructor(message = 'Valor propuesto inválido') {
    super(message);
    this.name = 'ReunionProposalValidationError';
  }
}

/** Convierte errores de dominio en { status, body } para API routes. */
export function reunionErrorResponse(err: unknown): Response {
  if (
    err instanceof ReunionNotAllowedError ||
    err instanceof ReunionAuditNotEditableError ||
    err instanceof ReunionConsentRequiredError ||
    err instanceof ReunionSessionNotFoundError ||
    err instanceof ReunionProposalNotFoundError ||
    err instanceof ReunionProposalValidationError
  ) {
    return new Response(
      JSON.stringify({ success: false, data: null, error: err.message }),
      { status: err.httpStatus, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.error('[reunion]', err);
  return new Response(
    JSON.stringify({ success: false, data: null, error: 'Error interno del servidor' }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}
