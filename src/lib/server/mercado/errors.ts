export class MercadoInvalidFilterError extends Error {
  readonly code = 'MERCADO_INVALID_FILTER';

  constructor(message: string) {
    super(message);
    this.name = 'MercadoInvalidFilterError';
  }
}
