import { json, type RequestHandler } from '@sveltejs/kit';
import { requireAdminApi } from '$lib/server/api/guards';
import { AuditNotFoundError } from '$lib/server/backoffice/errors';
import { buildAuditBundle } from '$lib/server/bundle/build';
import { BUNDLE_SCHEMA_VERSION } from '$lib/server/bundle/version';
import { logger } from '$lib/server/logger';

export const GET: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireAdminApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  const auditId = params.id;
  if (!auditId) {
    return new Response(JSON.stringify({ error: 'ID requerido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const bundle = await buildAuditBundle(auditId);
    const filename = `audit-bundle-${auditId}.json`;
    return json(bundle, {
      headers: {
        'X-Bundle-Schema-Version': BUNDLE_SCHEMA_VERSION,
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (err) {
    if (err instanceof AuditNotFoundError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    logger.error('audit_bundle_export_failed', { auditId }, err);
    return new Response(JSON.stringify({ error: 'Error al exportar el bundle' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
