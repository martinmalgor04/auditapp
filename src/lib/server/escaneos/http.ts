import { z, ZodError } from 'zod';
import { apiError } from '$lib/server/api/envelope';
import { logger } from '$lib/server/logger';
import { AuditNotFoundError, ValidationError } from '$lib/server/backoffice/errors';
import {
  ConsentimientoFaltanteError,
  EscaneoNoMutableError,
  EscaneoNotFoundError,
  TransicionInvalidaError
} from './errors';
import { AGENTE_MAJOR_SOPORTADO } from './api';
import { dispositivoInput, escaneoEstado } from './schemas';

/** Chunk de ingesta: 1–100 dispositivos con el schema de #59 (R13, R15). */
export const chunkDispositivosInput = z
  .object({
    dispositivos: z.array(dispositivoInput).min(1).max(100)
  })
  .strict();

/** Body de `POST .../estado` (R16, R18). */
export const cambiarEstadoInput = z
  .object({
    estado: escaneoEstado,
    errorDetalle: z.string().min(1).max(2000).optional()
  })
  .strict();

// Semver oficial (https://semver.org): MAJOR.MINOR.PATCH con pre-release/build opcionales.
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export const AGENTE_VERSION_HEADER = 'X-Agente-Version';
export const AGENTE_HOSTNAME_HEADER = 'X-Agente-Hostname';

/**
 * Exige `X-Agente-Version` semver (R19). `X-Agente-Hostname` es opcional y se
 * trunca al límite del schema de creación (300).
 */
export function extraerVersionAgente(
  request: Request
): { version: string; hostname?: string } | Response {
  const version = request.headers.get(AGENTE_VERSION_HEADER)?.trim();
  if (!version || !SEMVER_RE.test(version)) {
    return apiError(`Header ${AGENTE_VERSION_HEADER} requerido con versión semver válida`, 400);
  }
  const hostname = request.headers.get(AGENTE_HOSTNAME_HEADER)?.trim().slice(0, 300) || undefined;
  return { version, hostname };
}

/** Major del agente contra el soportado (R20). */
export function esMajorAgenteCompatible(version: string): boolean {
  return Number(version.split('.')[0]) === AGENTE_MAJOR_SOPORTADO;
}

/**
 * Errores de dominio de #59 → envelope con status semántico (R29). Lo
 * desconocido es 500 genérico con log server-side (sin stack al cliente).
 */
export function mapErrorEscaneo(err: unknown): Response {
  if (err instanceof EscaneoNotFoundError) {
    return apiError(err.message, 404);
  }
  if (err instanceof AuditNotFoundError) {
    return apiError(err.message, 404);
  }
  if (err instanceof EscaneoNoMutableError) {
    return apiError(err.message, 409);
  }
  if (err instanceof TransicionInvalidaError) {
    return apiError(err.message, 409);
  }
  if (err instanceof ConsentimientoFaltanteError) {
    return apiError(err.message, 409);
  }
  if (err instanceof ValidationError) {
    return apiError(err.message, 400);
  }
  if (err instanceof ZodError) {
    return apiError(err.issues.map((i) => i.message).join('; '), 400);
  }
  logger.error('escaneo_api_error', {}, err);
  return apiError('Error interno', 500);
}
