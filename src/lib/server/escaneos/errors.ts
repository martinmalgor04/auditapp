export { AuditNotFoundError } from '$lib/server/backoffice/errors';

export class EscaneoNotFoundError extends Error {
  readonly code = 'ESCANEO_NOT_FOUND';

  constructor(message = 'Escaneo no encontrado') {
    super(message);
    this.name = 'EscaneoNotFoundError';
  }
}

export class EscaneoNoMutableError extends Error {
  readonly code = 'ESCANEO_NO_MUTABLE';

  constructor(message = 'El escaneo no acepta escrituras en su estado actual') {
    super(message);
    this.name = 'EscaneoNoMutableError';
  }
}

export class TransicionInvalidaError extends Error {
  readonly code = 'TRANSICION_INVALIDA';

  constructor(from: string, to: string) {
    super(`Transición inválida de ${from} a ${to}`);
    this.name = 'TransicionInvalidaError';
  }
}

export class ConsentimientoFaltanteError extends Error {
  readonly code = 'CONSENTIMIENTO_FALTANTE';

  constructor(message = 'Se requiere consentimiento registrado para iniciar el escaneo') {
    super(message);
    this.name = 'ConsentimientoFaltanteError';
  }
}

/** #62 R22: fusión contra ítem/fila de relevamiento inexistente o inválida. */
export class VinculoRelevamientoInvalidoError extends Error {
  readonly code = 'VINCULO_RELEVAMIENTO_INVALIDO';

  constructor(message = 'La fila del relevamiento manual destino no existe') {
    super(message);
    this.name = 'VinculoRelevamientoInvalidoError';
  }
}
