/** Errores tipados del dominio presupuestossys (#16). */

export class PsysConfigError extends Error {
  readonly code = 'PSYS_NOT_CONFIGURED';
  constructor(message = 'Integración con presupuestossys no configurada') {
    super(message);
    this.name = 'PsysConfigError';
  }
}

export class PsysRemoteError extends Error {
  readonly code = 'PSYS_REMOTE_ERROR';
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'PsysRemoteError';
  }
}

export class PsysPayloadError extends Error {
  readonly code = 'PSYS_PAYLOAD_INVALID';
  constructor(message: string) {
    super(message);
    this.name = 'PsysPayloadError';
  }
}

export class PsysNoApprovedReportError extends Error {
  readonly code = 'PSYS_NO_APPROVED_REPORT';
  constructor(message = 'No hay informe aprobado para crear el presupuesto') {
    super(message);
    this.name = 'PsysNoApprovedReportError';
  }
}

export class PsysLinkNotFoundError extends Error {
  readonly code = 'PSYS_LINK_NOT_FOUND';
  constructor(message = 'No hay presupuesto vinculado a esta auditoría') {
    super(message);
    this.name = 'PsysLinkNotFoundError';
  }
}
