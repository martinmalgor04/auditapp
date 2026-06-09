import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin, requireStaff } from '$lib/server/auth/guards';
import {
  archiveAudit,
  getAuditById,
  listTechnicians,
  updateAudit
} from '$lib/server/backoffice/audits';
import {
  generateBriefingLink,
  getBriefingUrl,
  regenerateBriefingLink
} from '$lib/server/backoffice/briefing-link';
import { parseCabResponses } from '$lib/server/backoffice/form-parsers';
import { failFromError } from '$lib/server/backoffice/route-helpers';

export const load: PageServerLoad = async ({ locals, params }) => {
  requireStaff(locals);

  const audit = await getAuditById(params.id);
  if (!audit) {
    error(404, 'Auditoría no encontrada');
  }

  const technicians = await listTechnicians();
  const readonly = audit.status === 'cerrada';
  const isAdmin = locals.user?.role === 'admin';

  return {
    audit,
    technicians,
    readonly,
    isAdmin,
    briefingUrl: audit.publicToken ? getBriefingUrl(audit.publicToken) : null
  };
};

export const actions: Actions = {
  update: async ({ request, locals, params }) => {
    const user = requireStaff(locals);

    try {
      const formData = await request.formData();
      const cabResponses = parseCabResponses(formData);

      await updateAudit(
        params.id,
        {
          segment: String(formData.get('segment') ?? '') as 'A' | 'B' | 'C',
          assignedTechId: String(formData.get('assignedTechId') ?? ''),
          scheduledAt: String(formData.get('scheduledAt') ?? ''),
          cabResponses
        },
        user.id
      );

      return { success: true };
    } catch (e) {
      return failFromError(e);
    }
  },

  archive: async ({ locals, params }) => {
    try {
      const admin = requireAdmin(locals);
      await archiveAudit(params.id, admin.id);
      redirect(303, '/tablero');
    } catch (e) {
      if (isRedirect(e)) {
        throw e;
      }
      return failFromError(e);
    }
  },

  generateBriefingLink: async ({ locals, params }) => {
    requireStaff(locals);

    try {
      const result = await generateBriefingLink(params.id);
      return { success: true, url: result.url, token: result.token };
    } catch (e) {
      return failFromError(e);
    }
  },

  regenerateBriefingLink: async ({ locals, params }) => {
    requireStaff(locals);

    try {
      const result = await regenerateBriefingLink(params.id);
      return { success: true, url: result.url, token: result.token };
    } catch (e) {
      return failFromError(e);
    }
  },

  copyBriefingLink: async ({ request, locals }) => {
    requireStaff(locals);
    const formData = await request.formData();
    const publicToken = String(formData.get('publicToken') ?? '');

    if (!publicToken) {
      return fail(400, { error: 'Token no disponible' });
    }

    return { success: true, url: getBriefingUrl(publicToken) };
  }
};
