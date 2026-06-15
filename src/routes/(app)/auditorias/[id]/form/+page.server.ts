import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
import {
  AuditFormNotAllowedError,
  AuditFormNotEditableError
} from '$lib/server/form/errors';
import { completeRelevamiento } from '$lib/server/form/complete';
import { loadAuditForm } from '$lib/server/form/load-form';
import { countPendingProposalsByAudit } from '$lib/server/db/reunion-proposals';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = requireStaff(locals);

  try {
    const [form, pendingProposalCount] = await Promise.all([
      loadAuditForm(params.id, user),
      countPendingProposalsByAudit(params.id).catch(() => 0)
    ]);
    return { ...form, auditId: params.id, pendingProposalCount };
  } catch (err) {
    if (err instanceof AuditFormNotAllowedError) {
      error(403, err.message);
    }
    if (err instanceof AuditFormNotEditableError) {
      error(409, err.message);
    }
    throw err;
  }
};

export const actions: Actions = {
  complete: async ({ locals, params }) => {
    const user = requireStaff(locals);

    try {
      const result = await completeRelevamiento(params.id, user);
      if (result.warnings.length > 0) {
        return {
          success: true,
          warnings: result.warnings,
          status: result.status
        };
      }
      redirect(303, `/auditorias/${params.id}`);
    } catch (err) {
      if (isRedirect(err)) throw err;
      if (err instanceof AuditFormNotAllowedError) {
        return fail(403, { error: err.message });
      }
      if (err instanceof AuditFormNotEditableError) {
        return fail(409, { error: err.message });
      }
      return fail(500, { error: 'Error al completar relevamiento' });
    }
  }
};
