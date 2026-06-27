/**
 * #52 — Envío del link de briefing al cliente por email.
 *
 * T3: sendBriefingEmail — guard (admin || técnico asignado) + estado + validación Zod + sendEmail.
 * T4: getBriefingEmailMark — marca derivada de email_log (sin migración).
 */
import { z } from 'zod';
import { getSql } from '$lib/server/db/client';
import { sendEmail } from '$lib/server/email/index';
import { listEmailLogByTemplate } from '$lib/server/db/email-log';
import { techIsAssigned } from '$lib/server/db/audit-assignment';
import {
  canShowBriefingLink,
  getBriefingUrl
} from '$lib/server/backoffice/briefing-link';
import {
  AuditNotFoundError,
  ForbiddenError,
  InvalidStateTransitionError,
  ValidationError
} from '$lib/server/backoffice/errors';
import type { AppUser } from '$lib/server/auth/types';

// R4: schema de validación del destinatario
export const briefingEmailRecipientSchema = z.string().trim().email();

export type BriefingEmailResult = {
  status: 'enviado' | 'fallido' | 'dry_run';
  sentTo: string;
  error?: string;
};

type AuditBriefingRow = {
  id: string;
  status: string;
  public_token: string | null;
  empresa_id: string;
  archived_at: Date | null;
};

type EmpresaContactRow = {
  email: string | null;
  referente_nombre: string | null;
  razon_social: string;
};

async function getAuditBriefingRow(auditId: string): Promise<AuditBriefingRow> {
  const sql = getSql();
  const [row] = await sql<AuditBriefingRow[]>`
    SELECT id, status, public_token, empresa_id, archived_at
    FROM audit
    WHERE id = ${auditId}
    LIMIT 1
  `;
  if (!row || row.archived_at) {
    throw new AuditNotFoundError();
  }
  return row;
}

async function getEmpresaContact(empresaId: string): Promise<EmpresaContactRow> {
  const sql = getSql();
  const [row] = await sql<EmpresaContactRow[]>`
    SELECT email, referente_nombre, razon_social
    FROM empresa
    WHERE id = ${empresaId}
    LIMIT 1
  `;
  if (!row) {
    throw new AuditNotFoundError('Empresa no encontrada');
  }
  return row;
}

/**
 * Envía el briefing al cliente por email (R4, R5, R8, R9).
 *
 * Guard: admin o técnico asignado (R8).
 * Guard estado: canShowBriefingLink (R2).
 * Validación Zod del destinatario (R4).
 * NO modifica audit.status ni public_token (R9).
 */
export async function sendBriefingEmail(
  auditId: string,
  user: AppUser,
  toOverride?: string
): Promise<BriefingEmailResult> {
  const audit = await getAuditBriefingRow(auditId);

  // R8: guard admin || técnico asignado
  if (user.role !== 'admin') {
    const assigned = await techIsAssigned(auditId, user.id);
    if (!assigned) {
      throw new ForbiddenError('Solo el admin o el técnico asignado puede enviar el briefing por email');
    }
  }

  // R2: guard de estado — briefing_enviado o briefing_completo con token
  const auditStatus = audit.status as import('$lib/server/db/audit-status').AuditStatus;
  if (!canShowBriefingLink(auditStatus, audit.public_token)) {
    throw new InvalidStateTransitionError(
      'La auditoría no tiene un link de briefing activo (debe estar en briefing_enviado o briefing_completo con token)'
    );
  }

  const empresa = await getEmpresaContact(audit.empresa_id);

  // R4: determinar destinatario y validar con Zod
  const rawTo = toOverride ?? empresa.email ?? '';
  const parsed = briefingEmailRecipientSchema.safeParse(rawTo);
  if (!parsed.success) {
    throw new ValidationError(
      `Email de destinatario inválido: ${parsed.error.errors.map((e) => e.message).join('; ')}`
    );
  }
  const to = parsed.data;

  // R5: computar datos del email
  const briefingUrl = getBriefingUrl(audit.public_token!);
  const contactoNombre = empresa.referente_nombre ?? empresa.razon_social;

  // R5: invocar sendEmail (registra en email_log automáticamente)
  const result = await sendEmail('envio_briefing_cliente', to, { contactoNombre, briefingUrl });

  return {
    status: result.status,
    sentTo: to,
    error: result.error
  };
}

/**
 * Marca derivada de email_log (R6, R7, R11).
 *
 * Consulta el último envío de `envio_briefing_cliente` al email del cliente de esa auditoría.
 * No requiere migración: filtra por to_email del contacto de la empresa.
 */
export async function getBriefingEmailMark(
  auditId: string
): Promise<{ sentTo: string; sentAt: string } | null> {
  const sql = getSql();

  // Obtener el email de contacto de la empresa de esta auditoría
  const [auditRow] = await sql<{ empresa_id: string; archived_at: Date | null }[]>`
    SELECT empresa_id, archived_at FROM audit WHERE id = ${auditId} LIMIT 1
  `;
  if (!auditRow || auditRow.archived_at) return null;

  const [empresa] = await sql<{ email: string | null }[]>`
    SELECT email FROM empresa WHERE id = ${auditRow.empresa_id} LIMIT 1
  `;
  if (!empresa || !empresa.email) return null;

  // Consultar email_log filtrando por template + to_email del cliente
  const rows = await listEmailLogByTemplate('envio_briefing_cliente');
  const match = rows
    .filter((r) => r.toEmail === empresa.email && r.status !== 'fallido')
    .sort((a, b) => {
      const ta = (a.sentAt ?? a.createdAt).getTime();
      const tb = (b.sentAt ?? b.createdAt).getTime();
      return tb - ta;
    })[0];

  if (!match) return null;

  return {
    sentTo: match.toEmail,
    sentAt: (match.sentAt ?? match.createdAt).toISOString()
  };
}
