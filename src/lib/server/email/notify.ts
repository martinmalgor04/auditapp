import { getSql } from '$lib/server/db/client';
import { listAuditAssignments } from '$lib/server/db/audit-assignment';
import { getServerEnv } from '$lib/server/env';
import { logger } from '$lib/server/logger';
import { sendEmail } from './index';

export type EventoInterno =
  | 'auditoria_asignada'
  | 'briefing_completado'
  | 'informe_aprobado'
  | 'auditoria_cerrada'
  | 'feedback_cliente';

type AuditNotifyContext = {
  id: string;
  refCode: string;
  clienteNombre: string;
  createdBy: string;
};

type RecipientRow = {
  id: string;
  email: string | null;
  name: string;
  role: 'admin' | 'tecnico';
  active: boolean;
  notifyInternalEmail: boolean;
};

async function loadAuditContext(auditId: string): Promise<AuditNotifyContext | null> {
  const sql = getSql();
  const [row] = await sql<
    { id: string; ref_code: string; razon_social: string; created_by: string | null }[]
  >`
    SELECT a.id, a.ref_code, e.razon_social, a.created_by
    FROM audit a
    JOIN empresa e ON e.id = a.empresa_id
    WHERE a.id = ${auditId}
    LIMIT 1
  `;
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    refCode: row.ref_code,
    clienteNombre: row.razon_social,
    createdBy: row.created_by ?? ''
  };
}

function buildAuditUrl(auditId: string): string {
  const env = getServerEnv();
  return `${env.PUBLIC_APP_URL}/auditorias/${auditId}`;
}

async function loadUsersByIds(userIds: string[]): Promise<Map<string, RecipientRow>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'tecnico';
      active: boolean;
      notify_internal_email: boolean;
    }[]
  >`
    SELECT id, email, name, role, active, notify_internal_email
    FROM app_user
    WHERE id = ANY(${userIds}::uuid[])
  `;
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        email: r.email,
        name: r.name,
        role: r.role,
        active: r.active,
        notifyInternalEmail: r.notify_internal_email
      }
    ])
  );
}

async function listActiveAdminIds(): Promise<string[]> {
  const sql = getSql();
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM app_user WHERE role = 'admin' AND active = true
  `;
  return rows.map((r) => r.id);
}

async function resolveAdminInvolvedUserIds(createdBy: string): Promise<string[]> {
  if (!createdBy) {
    return listActiveAdminIds();
  }
  const users = await loadUsersByIds([createdBy]);
  const creator = users.get(createdBy);
  if (creator?.active && creator.role === 'admin') {
    return [creator.id];
  }
  return listActiveAdminIds();
}

function filterEligibleEmailUserIds(userIds: string[], users: Map<string, RecipientRow>): string[] {
  const out: string[] = [];
  for (const id of userIds) {
    const user = users.get(id);
    if (!user?.active || !user.email?.trim() || !user.notifyInternalEmail) {
      continue;
    }
    if (!out.includes(id)) {
      out.push(id);
    }
  }
  return out;
}

export async function resolveInternalRecipientUserIds(
  auditId: string,
  evento: EventoInterno,
  opts?: { nuevosTechIds?: string[] }
): Promise<string[]> {
  const ctx = await loadAuditContext(auditId);
  if (!ctx) {
    return [];
  }

  const adminIds = await resolveAdminInvolvedUserIds(ctx.createdBy);
  let techIds: string[] = [];

  if (evento === 'auditoria_asignada') {
    techIds = opts?.nuevosTechIds ?? [];
  } else {
    const assignments = await listAuditAssignments(auditId);
    techIds = [...new Set(assignments.map((a) => a.techId))];
  }

  const candidateIds = [...new Set([...adminIds, ...techIds])];
  const users = await loadUsersByIds(candidateIds);
  return filterEligibleEmailUserIds(candidateIds, users);
}

export async function resolveEmailsFromUserIds(userIds: string[]): Promise<string[]> {
  const users = await loadUsersByIds(userIds);
  return filterEligibleEmailUserIds(userIds, users)
    .map((id) => users.get(id)?.email?.trim())
    .filter((email): email is string => Boolean(email));
}

async function safeNotify(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.error(`notify_${label}_failed`, {}, err);
  }
}

export async function onAuditoriaAsignada(auditId: string, techIds: string[]): Promise<void> {
  await safeNotify('auditoria_asignada', async () => {
    const ctx = await loadAuditContext(auditId);
    if (!ctx || techIds.length === 0) {
      return;
    }

    const recipientIds = await resolveInternalRecipientUserIds(auditId, 'auditoria_asignada', {
      nuevosTechIds: techIds
    });
    const users = await loadUsersByIds(recipientIds);
    const auditUrl = buildAuditUrl(auditId);

    for (const userId of recipientIds) {
      const user = users.get(userId);
      if (!user?.email) {
        continue;
      }
      await sendEmail('aviso_auditoria_asignada', user.email, {
        tecnicoNombre: user.name,
        auditRef: ctx.refCode,
        clienteNombre: ctx.clienteNombre,
        auditUrl
      });
    }
  });
}

export async function onBriefingCompletado(auditId: string): Promise<void> {
  await safeNotify('briefing_completado', async () => {
    const ctx = await loadAuditContext(auditId);
    if (!ctx) {
      return;
    }
    const userIds = await resolveInternalRecipientUserIds(auditId, 'briefing_completado');
    const emails = await resolveEmailsFromUserIds(userIds);
    if (emails.length === 0) {
      return;
    }
    await sendEmail('aviso_briefing_completado', emails, {
      auditRef: ctx.refCode,
      clienteNombre: ctx.clienteNombre,
      auditUrl: buildAuditUrl(auditId)
    });
  });
}

export async function onInformeAprobado(
  auditId: string,
  _reportId: string,
  version: number
): Promise<void> {
  await safeNotify('informe_aprobado', async () => {
    const ctx = await loadAuditContext(auditId);
    if (!ctx) {
      return;
    }
    const userIds = await resolveInternalRecipientUserIds(auditId, 'informe_aprobado');
    const emails = await resolveEmailsFromUserIds(userIds);
    if (emails.length === 0) {
      return;
    }
    await sendEmail('aviso_informe_aprobado', emails, {
      auditRef: ctx.refCode,
      clienteNombre: ctx.clienteNombre,
      version,
      auditUrl: buildAuditUrl(auditId)
    });
  });
}

export async function onAuditoriaCerrada(auditId: string): Promise<void> {
  await safeNotify('auditoria_cerrada', async () => {
    const ctx = await loadAuditContext(auditId);
    if (!ctx) {
      return;
    }
    const userIds = await resolveInternalRecipientUserIds(auditId, 'auditoria_cerrada');
    const emails = await resolveEmailsFromUserIds(userIds);
    if (emails.length === 0) {
      return;
    }
    await sendEmail('aviso_auditoria_cerrada', emails, {
      auditRef: ctx.refCode,
      clienteNombre: ctx.clienteNombre,
      auditUrl: buildAuditUrl(auditId)
    });
  });
}

export async function onFeedbackCliente(auditId: string, valoracionGlobal: number): Promise<void> {
  await safeNotify('feedback_cliente', async () => {
    const ctx = await loadAuditContext(auditId);
    if (!ctx) {
      return;
    }
    const userIds = await resolveInternalRecipientUserIds(auditId, 'feedback_cliente');
    const emails = await resolveEmailsFromUserIds(userIds);
    if (emails.length === 0) {
      return;
    }
    await sendEmail('aviso_feedback_cliente', emails, {
      auditRef: ctx.refCode,
      clienteNombre: ctx.clienteNombre,
      valoracionGlobal,
      auditUrl: buildAuditUrl(auditId)
    });
  });
}
