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
  completarBriefingInternamente,
  generateBriefingLink,
  getBriefingUrl,
  regenerateBriefingLink
} from '$lib/server/backoffice/briefing-link';
import { parseCabResponses } from '$lib/server/backoffice/form-parsers';
import { failFromError } from '$lib/server/backoffice/route-helpers';
import { listReportsByAudit } from '$lib/server/db/informe-reports';
import { listReunionSessionsByAudit } from '$lib/server/db/reunion-sessions';
import {
  findLatestActiveLinkByAudit,
  toProposalLinkView
} from '$lib/server/db/psys-links';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = requireStaff(locals);

  const audit = await getAuditById(params.id, user);
  if (!audit) {
    error(404, 'Auditoría no encontrada');
  }

  const technicians = await listTechnicians();
  const readonly = audit.status === 'cerrada';
  const isAdmin = locals.user?.role === 'admin';

  // Sesiones de reunión (listado simple para mostrar en detalle)
  const reunionSessions = await listReunionSessionsByAudit(audit.id).catch(() => []);

  // Informe IA (R27): listado de versiones; técnico asignado solo ve aprobadas (R1).
  let reports: Awaited<ReturnType<typeof listReportsByAudit>> = [];
  let proposalLink: ReturnType<typeof toProposalLinkView> | null = null;
  if (audit.status === 'cerrada') {
    const all = await listReportsByAudit(audit.id);
    reports = isAdmin
      ? all
      : audit.assignedTechId === user.id
        ? all.filter((r) => r.status === 'aprobado')
        : [];
    const activeLink = await findLatestActiveLinkByAudit(audit.id);
    proposalLink = activeLink ? toProposalLinkView(activeLink) : null;
  }

  const hasApprovedReport = reports.some((r) => r.status === 'aprobado');

  const canEditVisita =
    isAdmin || (audit.assignedTechId !== null && audit.assignedTechId === user.id);

  return {
    audit,
    technicians,
    readonly,
    isAdmin,
    canEditVisita,
    startedAt: audit.startedAt?.toISOString() ?? null,
    finishedAt: audit.finishedAt?.toISOString() ?? null,
    briefingUrl: audit.publicToken ? getBriefingUrl(audit.publicToken) : null,
    reports: reports.map((r) => ({
      report_id: r.id,
      version: r.version,
      status: r.status,
      created_at: r.createdAt.toISOString(),
      approved_by: r.approvedBy,
      approved_at: r.approvedAt ? r.approvedAt.toISOString() : null,
      error_message: r.errorMessage
    })),
    hasApprovedReport,
    proposalLink,
    reunionSessions: reunionSessions.map((s) => ({
      id: s.id,
      session_type: s.session_type,
      status: s.status,
      created_at: s.created_at.toISOString()
    }))
  };
};

export const actions: Actions = {
  update: async ({ request, locals, params }) => {
    const user = requireStaff(locals);

    try {
      const formData = await request.formData();
      const cabResponses = parseCabResponses(formData);

      const startedAtRaw = formData.get('startedAt');
      const finishedAtRaw = formData.get('finishedAt');

      await updateAudit(
        params.id,
        {
          segment: String(formData.get('segment') ?? '') as 'A' | 'B' | 'C',
          assignedTechId: String(formData.get('assignedTechId') ?? ''),
          scheduledAt: String(formData.get('scheduledAt') ?? ''),
          cabResponses,
          startedAt: startedAtRaw !== null ? String(startedAtRaw) || null : undefined,
          finishedAt: finishedAtRaw !== null ? String(finishedAtRaw) || null : undefined
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

  completarBriefingInternamente: async ({ locals, params }) => {
    requireStaff(locals);
    try {
      await completarBriefingInternamente(params.id);
      return { success: true };
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
