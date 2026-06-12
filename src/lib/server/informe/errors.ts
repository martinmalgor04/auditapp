/** Errores tipados del dominio informe IA (#14). */

export class InformeNotConfiguredError extends Error {
  readonly code = 'INFORME_NOT_CONFIGURED';
  constructor(message = 'La generación de informes no está configurada (falta ANTHROPIC_API_KEY)') {
    super(message);
    this.name = 'InformeNotConfiguredError';
  }
}

export class InformeAuditNotClosedError extends Error {
  readonly code = 'INFORME_AUDIT_NOT_CLOSED';
  constructor(message = 'La auditoría debe estar cerrada para generar el informe') {
    super(message);
    this.name = 'InformeAuditNotClosedError';
  }
}

export class InformeReportNotFoundError extends Error {
  readonly code = 'INFORME_REPORT_NOT_FOUND';
  constructor(message = 'Informe no encontrado') {
    super(message);
    this.name = 'InformeReportNotFoundError';
  }
}

export class InformeInvalidTransitionError extends Error {
  readonly code = 'INFORME_INVALID_TRANSITION';
  constructor(from: string, to: string) {
    super(`Transición de estado inválida: ${from} → ${to}`);
    this.name = 'InformeInvalidTransitionError';
  }
}

export class InformeDraftValidationError extends Error {
  readonly code = 'INFORME_DRAFT_INVALID';
  constructor(message: string) {
    super(message);
    this.name = 'InformeDraftValidationError';
  }
}

export class InformeGenerationError extends Error {
  readonly code = 'INFORME_GENERATION_FAILED';
  constructor(message: string) {
    super(message);
    this.name = 'InformeGenerationError';
  }
}
