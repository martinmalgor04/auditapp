import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
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
import { listReportsByAudit } from '$lib/server/db/informe-reports';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = requireStaff(locals);

  const audit = await getAuditById(params.id, user);
  if (!audit) {
    error(404, 'Auditoría no encontrada');
  }

  const technicians = await listTechnicians();
  const readonly = audit.status === 'cerrada';
  const isAdmin = locals.user?.role === 'admin';

  // Informe IA (R27): listado de versiones; técnico asignado solo ve aprobadas (R1).
  let reports: Awaited<ReturnType<typeof listReportsByAudit>> = [];
  if (audit.status === 'cerrada') {
    const all = await listReportsByAudit(audit.id);
    reports = isAdmin
      ? all
      : audit.assignedTechId === user.id
        ? all.filter((r) => r.status === 'aprobado')
        : [];
  }

  return {
    audit,
    technicians,
    readonly,
    isAdmin,
    briefingUrl: audit.publicToken ? getBriefingUrl(audit.publicToken) : null,
    reports: reports.map((r) => ({
      report_id: r.id,
      version: r.version,
      status: r.status,
      created_at: r.createdAt.toISOString(),
      approved_by: r.approvedBy,
      approved_at: r.approvedAt ? r.approvedAt.toISOString() : null,
      error_message: r.errorMessage
    }))
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
      const user = requireStaff(locals);
      await archiveAudit(params.id, user.id);
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
