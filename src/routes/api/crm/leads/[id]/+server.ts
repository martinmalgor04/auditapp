import type { RequestHandler } from './$types';
import { requireAdminApi } from '$lib/server/api/guards';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { crmLeadUpdateSchema } from '$lib/server/crm/schemas';
import {
  CrmLeadDiscardedError,
  CrmLeadNotFoundError
} from '$lib/server/crm/errors';
import {
  countClients,
  getLeadById,
  linkAudit,
  listLeadEvents,
  updateLead
} from '$lib/server/db/crm-leads';
import { getSql } from '$lib/server/db/client';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const user = requireAdminApi(locals);
  if (user instanceof Response) {
    return user;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('JSON inválido', 400);
  }

  if (body && typeof body === 'object') {
    const forbidden = ['email', 'source'] as const;
    for (const key of forbidden) {
      if (key in (body as Record<string, unknown>)) {
        return apiError(`El campo ${key} no es editable`, 400);
      }
    }
  }

  const parsed = crmLeadUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues.map((i) => i.message).join('; '), 400);
  }

  const existing = await getLeadById(params.id);
  if (!existing) {
    return apiError('Lead no encontrado', 404);
  }

  const patch = parsed.data;
  const clientsBefore = await countClients();

  try {
    const sql = getSql();
    if (patch.client_id) {
      const [client] = await sql<{ id: string }[]>`
        SELECT id FROM client WHERE id = ${patch.client_id} LIMIT 1
      `;
      if (!client) {
        return apiError('Cliente no encontrado', 404);
      }
    }
    if (patch.audit_id) {
      const [audit] = await sql<{ id: string }[]>`
        SELECT id FROM audit WHERE id = ${patch.audit_id} LIMIT 1
      `;
      if (!audit) {
        return apiError('Auditoría no encontrada', 404);
      }
    }

    let lead = existing;
    const { audit_id: auditId, ...rest } = patch;
    if (Object.keys(rest).length > 0) {
      lead = await updateLead(params.id, rest);
    }
    if (auditId) {
      lead = await linkAudit(params.id, auditId, user.id);
    }

    const clientsAfter = await countClients();
    if (clientsAfter !== clientsBefore) {
      throw new Error('CRM no debe modificar clientes');
    }

    const events = await listLeadEvents(params.id);
    return apiSuccess({ lead, events });
  } catch (e) {
    if (e instanceof CrmLeadDiscardedError) {
      return apiError(e.message, 409);
    }
    if (e instanceof CrmLeadNotFoundError) {
      return apiError(e.message, 404);
    }
    throw e;
  }
};
