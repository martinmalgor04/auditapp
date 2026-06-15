/** Formato de archivo no soportado por el importador (R4). Mapea a 415 en el endpoint. */
export class UnsupportedFormatError extends Error {
  readonly code = 'UNSUPPORTED_FORMAT';

  constructor(message = 'Formato no soportado: usá CSV o .xlsx') {
    super(message);
    this.name = 'UnsupportedFormatError';
  }
}
