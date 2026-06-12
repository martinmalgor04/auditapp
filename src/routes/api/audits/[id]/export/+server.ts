import { json, type RequestHandler } from '@sveltejs/kit';
import { requireAdminApi } from '$lib/server/api/guards';
import { AuditNotFoundError } from '$lib/server/backoffice/errors';
import { buildCanonicalAuditJson } from '$lib/server/canonical/build';
import { AuditNotClosedError, CanonicalBuildError } from '$lib/server/canonical/errors';
import { CANONICAL_SCHEMA_VERSION } from '$lib/server/canonical/version';

export const GET: RequestHandler = async ({ params, locals }) => {
  const userOrResponse = requireAdminApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }

  void userOrResponse;

  const auditId = params.id;
  if (!auditId) {
    return new Response(JSON.stringify({ error: 'ID requerido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const canonical = await buildCanonicalAuditJson(auditId, { allowOpen: false });

    return json(canonical, {
      headers: {
        'X-Schema-Version': CANONICAL_SCHEMA_VERSION
      }
    });
  } catch (err) {
    if (err instanceof AuditNotFoundError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (err instanceof AuditNotClosedError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (err instanceof CanonicalBuildError) {
      return new Response(JSON.stringify({ error: 'Error al exportar auditoría' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ error: 'Error al exportar auditoría' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
