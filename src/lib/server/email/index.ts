import { z } from 'zod';
import { insertEmailLog, type EmailTemplateName } from '$lib/server/db/email-log';
import { logger } from '$lib/server/logger';
import { EMAIL_TEMPLATES, type EmailTemplateData, type RenderedEmail } from './templates';
import { hasActiveTransport, isDryRun, resolveFromAddress, sendWithRetry } from './transport';

export type { EmailTemplateName } from '$lib/server/db/email-log';

export type EmailSendResult = {
  status: 'enviado' | 'fallido' | 'dry_run';
  logIds: string[];
  error?: string;
  rendered?: RenderedEmail;
};

const emailAddressSchema = z.string().email();

function normalizeRecipients(to: string | string[]): { emails: string[] } | { error: string } {
  const list = Array.isArray(to) ? to : [to];
  const emails: string[] = [];
  for (const raw of list) {
    const trimmed = raw.trim();
    const parsed = emailAddressSchema.safeParse(trimmed);
    if (!parsed.success) {
      return { error: `Destinatario inválido: ${raw}` };
    }
    emails.push(parsed.data);
  }
  if (emails.length === 0) {
    return { error: 'Se requiere al menos un destinatario' };
  }
  return { emails };
}

type PerRecipientResult = {
  status: 'enviado' | 'fallido' | 'dry_run';
  logId: string;
  error?: string;
};

async function deliverOne(
  template: EmailTemplateName,
  to: string,
  rendered: RenderedEmail
): Promise<PerRecipientResult> {
  const from = resolveFromAddress();
  const dryRun = isDryRun();

  if (dryRun) {
    const { id } = await insertEmailLog({
      toEmail: to,
      template,
      status: 'dry_run',
      error: null,
      sentAt: null
    });
    logger.info('email_dry_run', {
      template,
      to,
      subject: rendered.subject,
      smtpConfigured: hasActiveTransport()
    });
    return { status: 'dry_run', logId: id };
  }

  try {
    await sendWithRetry({
      from,
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text
    });
    const sentAt = new Date();
    const { id } = await insertEmailLog({
      toEmail: to,
      template,
      status: 'enviado',
      error: null,
      sentAt
    });
    logger.info('email_sent', { template, to, subject: rendered.subject });
    return { status: 'enviado', logId: id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const { id } = await insertEmailLog({
      toEmail: to,
      template,
      status: 'fallido',
      error: message,
      sentAt: null
    });
    logger.error('email_failed', { template, to, subject: rendered.subject }, err);
    return { status: 'fallido', logId: id, error: message };
  }
}

export async function sendEmail<T extends EmailTemplateName>(
  template: T,
  to: string | string[],
  data: EmailTemplateData[T]
): Promise<EmailSendResult> {
  const templateDef = EMAIL_TEMPLATES[template];
  const parsed = templateDef.schema.safeParse(data);
  if (!parsed.success) {
    return {
      status: 'fallido',
      logIds: [],
      error: parsed.error.errors.map((e) => e.message).join('; ')
    };
  }

  const rendered = templateDef.render(parsed.data);
  const recipients = normalizeRecipients(to);
  if ('error' in recipients) {
    return { status: 'fallido', logIds: [], error: recipients.error };
  }

  const logIds: string[] = [];
  let hasFailure = false;
  let hasDryRun = false;
  let hasSuccess = false;
  let lastError: string | undefined;

  for (const email of recipients.emails) {
    const result = await deliverOne(template, email, rendered);
    logIds.push(result.logId);
    if (result.status === 'fallido') {
      hasFailure = true;
      lastError = result.error;
    } else if (result.status === 'dry_run') {
      hasDryRun = true;
    } else {
      hasSuccess = true;
    }
  }

  if (hasFailure && !hasSuccess && !hasDryRun) {
    return { status: 'fallido', logIds, error: lastError, rendered };
  }
  if (hasFailure) {
    return { status: 'fallido', logIds, error: lastError, rendered };
  }
  if (hasDryRun || isDryRun()) {
    return { status: 'dry_run', logIds, rendered };
  }
  return { status: 'enviado', logIds, rendered };
}

export type { EmailTemplateData } from './templates';
