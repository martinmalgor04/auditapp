import { getSql } from './client';

export type EmailTemplateName =
  | 'aviso_auditoria_asignada'
  | 'aviso_briefing_completado'
  | 'aviso_informe_aprobado'
  | 'aviso_auditoria_cerrada'
  | 'aviso_feedback_cliente'
  | 'password_reset'
  | 'envio_informe_cliente'
  | 'envio_briefing_cliente';

export type EmailLogStatus = 'enviado' | 'fallido' | 'dry_run';

export type EmailLogRow = {
  id: string;
  toEmail: string;
  template: EmailTemplateName;
  status: EmailLogStatus;
  error: string | null;
  createdAt: Date;
  sentAt: Date | null;
};

export async function insertEmailLog(input: {
  toEmail: string;
  template: EmailTemplateName;
  status: EmailLogStatus;
  error: string | null;
  sentAt: Date | null;
}): Promise<{ id: string }> {
  const sql = getSql();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO email_log (to_email, template, status, error, sent_at)
    VALUES (
      ${input.toEmail},
      ${input.template},
      ${input.status},
      ${input.error},
      ${input.sentAt}
    )
    RETURNING id
  `;
  return { id: row.id };
}

export async function listEmailLogByTemplate(
  template: EmailTemplateName,
  limit = 100
): Promise<EmailLogRow[]> {
  const sql = getSql();
  const rows = await sql<
    {
      id: string;
      to_email: string;
      template: string;
      status: EmailLogStatus;
      error: string | null;
      created_at: Date;
      sent_at: Date | null;
    }[]
  >`
    SELECT id, to_email, template, status, error, created_at, sent_at
    FROM email_log
    WHERE template = ${template}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    toEmail: r.to_email,
    template: r.template as EmailTemplateName,
    status: r.status,
    error: r.error,
    createdAt: r.created_at,
    sentAt: r.sent_at
  }));
}
