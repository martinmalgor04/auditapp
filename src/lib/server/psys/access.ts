import { apiError } from '$lib/server/api/envelope';
import {
  PsysConfigError,
  PsysLinkNotFoundError,
  PsysNoApprovedReportError,
  PsysPayloadError,
  PsysRemoteError
} from './errors';

export function psysErrorResponse(err: unknown): Response {
  if (err instanceof PsysNoApprovedReportError) {
    return apiError(err.message, 409);
  }
  if (err instanceof PsysConfigError) {
    return apiError(err.message, 503);
  }
  if (err instanceof PsysRemoteError) {
    return apiError(err.message, 502);
  }
  if (err instanceof PsysLinkNotFoundError) {
    return apiError(err.message, 404);
  }
  if (err instanceof PsysPayloadError) {
    return apiError(err.message, 500);
  }
  return apiError('Error interno', 500);
}
