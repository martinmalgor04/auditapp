import { type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { requireAdminApi } from '$lib/server/api/guards';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { json } from '@sveltejs/kit';
import {
  AuditBundleResolutionError,
  AuditBundleValidationError
} from '$lib/server/bundle/errors';
import { importAuditBundle } from '$lib/server/bundle/import';
import { logger } from '$lib/server/logger';

const requestSchema = z.object({
  // OQ-2: default dry-run; la escritura exige elegir strict|permissive explícito.
  mode: z.enum(['dry-run', 'strict', 'permissive']).default('dry-run'),
  bundle: z.unknown()
});

export const POST: RequestHandler = async ({ request, locals }) => {
  const userOrResponse = requireAdminApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }
  const user = userOrResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('Body JSON inválido', 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Request inválido: se espera { mode?, bundle }', 400);
  }
  const { mode, bundle } = parsed.data;

  try {
    const result = await importAuditBundle(bundle, user, mode);

    if (result.mode === 'dry-run') {
      return apiSuccess({ mode: 'dry-run', report: result.report });
    }
    return apiSuccess({
      mode: result.mode,
      audit_id: result.auditId,
      duplicate: result.duplicate,
      report: result.report
    });
  } catch (err) {
    if (err instanceof AuditBundleValidationError) {
      return json(
        { success: false, data: null, error: err.message, issues: err.issues },
        { status: 400 }
      );
    }
    if (err instanceof AuditBundleResolutionError) {
      return json(
        { success: false, data: null, error: err.message, missing: err.missing },
        { status: 422 }
      );
    }
    logger.error('audit_bundle_import_failed', { mode }, err);
    return apiError('Error al importar el bundle', 500);
  }
};
