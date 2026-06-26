import { z } from 'zod';
import { emailButton, wrapEmailLayout } from './layout';
import type { EmailTemplateName } from '$lib/server/db/email-log';

export type RenderedEmail = { subject: string; html: string; text: string };

export type EmailTemplate<T> = {
  schema: z.ZodType<T>;
  render: (data: T) => RenderedEmail;
};

const avisoAuditoriaAsignadaSchema = z.object({
  tecnicoNombre: z.string().min(1),
  auditRef: z.string().min(1),
  clienteNombre: z.string().min(1),
  auditUrl: z.string().url()
});

const avisoBriefingCompletadoSchema = z.object({
  auditRef: z.string().min(1),
  clienteNombre: z.string().min(1),
  auditUrl: z.string().url()
});

const avisoInformeAprobadoSchema = z.object({
  auditRef: z.string().min(1),
  clienteNombre: z.string().min(1),
  version: z.number().int().positive(),
  auditUrl: z.string().url()
});

const avisoAuditoriaCerradaSchema = z.object({
  auditRef: z.string().min(1),
  clienteNombre: z.string().min(1),
  auditUrl: z.string().url()
});

const avisoFeedbackClienteSchema = z.object({
  auditRef: z.string().min(1),
  clienteNombre: z.string().min(1),
  valoracionGlobal: z.number().int().min(1).max(5),
  auditUrl: z.string().url()
});

const passwordResetSchema = z.object({
  nombre: z.string().min(1),
  resetUrl: z.string().url(),
  expiraEnMin: z.number().int().positive()
});

const envioInformeClienteSchema = z.object({
  contactoNombre: z.string().min(1),
  informeUrl: z.string().url(),
  pdfUrl: z.string().url().optional()
});

const envioBriefingClienteSchema = z.object({
  contactoNombre: z.string().min(1),
  briefingUrl: z.string().url()
});

function renderReserved(name: string): RenderedEmail {
  return {
    subject: `[Reservado] ${name}`,
    html: `<p>Plantilla reservada para feature futura.</p>`,
    text: `Plantilla reservada: ${name}`
  };
}

export type EmailTemplateData = {
  aviso_auditoria_asignada: z.infer<typeof avisoAuditoriaAsignadaSchema>;
  aviso_briefing_completado: z.infer<typeof avisoBriefingCompletadoSchema>;
  aviso_informe_aprobado: z.infer<typeof avisoInformeAprobadoSchema>;
  aviso_auditoria_cerrada: z.infer<typeof avisoAuditoriaCerradaSchema>;
  aviso_feedback_cliente: z.infer<typeof avisoFeedbackClienteSchema>;
  password_reset: z.infer<typeof passwordResetSchema>;
  envio_informe_cliente: z.infer<typeof envioInformeClienteSchema>;
  envio_briefing_cliente: z.infer<typeof envioBriefingClienteSchema>;
};

export const EMAIL_TEMPLATES: { [K in EmailTemplateName]: EmailTemplate<EmailTemplateData[K]> } = {
  aviso_auditoria_asignada: {
    schema: avisoAuditoriaAsignadaSchema,
    render(data) {
      const subject = `Auditoría asignada — ${data.auditRef}`;
      const bodyHtml = `<p style="margin:0 0 12px;color:#374151;">Hola ${data.tecnicoNombre},</p>
<p style="margin:0 0 12px;color:#374151;">Te asignaron la auditoría <strong>${data.auditRef}</strong> del cliente <strong>${data.clienteNombre}</strong>.</p>
${emailButton(data.auditUrl, 'Ver auditoría')}`;
      const bodyText = `Hola ${data.tecnicoNombre},

Te asignaron la auditoría ${data.auditRef} del cliente ${data.clienteNombre}.

Ver auditoría: ${data.auditUrl}`;
      const wrapped = wrapEmailLayout({ title: subject, bodyHtml, bodyText });
      return { subject, ...wrapped };
    }
  },
  aviso_briefing_completado: {
    schema: avisoBriefingCompletadoSchema,
    render(data) {
      const subject = `Briefing completado — ${data.auditRef}`;
      const bodyHtml = `<p style="margin:0 0 12px;color:#374151;">El cliente <strong>${data.clienteNombre}</strong> completó el briefing de la auditoría <strong>${data.auditRef}</strong>.</p>
${emailButton(data.auditUrl, 'Ver auditoría')}`;
      const bodyText = `El cliente ${data.clienteNombre} completó el briefing de la auditoría ${data.auditRef}.

Ver auditoría: ${data.auditUrl}`;
      const wrapped = wrapEmailLayout({ title: subject, bodyHtml, bodyText });
      return { subject, ...wrapped };
    }
  },
  aviso_informe_aprobado: {
    schema: avisoInformeAprobadoSchema,
    render(data) {
      const subject = `Informe aprobado — ${data.auditRef} v${data.version}`;
      const bodyHtml = `<p style="margin:0 0 12px;color:#374151;">Se aprobó el informe v${data.version} de la auditoría <strong>${data.auditRef}</strong> (${data.clienteNombre}).</p>
${emailButton(data.auditUrl, 'Ver auditoría')}`;
      const bodyText = `Se aprobó el informe v${data.version} de la auditoría ${data.auditRef} (${data.clienteNombre}).

Ver auditoría: ${data.auditUrl}`;
      const wrapped = wrapEmailLayout({ title: subject, bodyHtml, bodyText });
      return { subject, ...wrapped };
    }
  },
  aviso_auditoria_cerrada: {
    schema: avisoAuditoriaCerradaSchema,
    render(data) {
      const subject = `Auditoría cerrada — ${data.auditRef}`;
      const bodyHtml = `<p style="margin:0 0 12px;color:#374151;">La auditoría <strong>${data.auditRef}</strong> de <strong>${data.clienteNombre}</strong> fue cerrada.</p>
${emailButton(data.auditUrl, 'Ver auditoría')}`;
      const bodyText = `La auditoría ${data.auditRef} de ${data.clienteNombre} fue cerrada.

Ver auditoría: ${data.auditUrl}`;
      const wrapped = wrapEmailLayout({ title: subject, bodyHtml, bodyText });
      return { subject, ...wrapped };
    }
  },
  aviso_feedback_cliente: {
    schema: avisoFeedbackClienteSchema,
    render(data) {
      const subject = `Feedback del cliente — ${data.auditRef}`;
      const bodyHtml = `<p style="margin:0 0 12px;color:#374151;">El cliente <strong>${data.clienteNombre}</strong> respondió la encuesta de conformidad de <strong>${data.auditRef}</strong>.</p>
<p style="margin:0 0 12px;color:#374151;">Valoración global: <strong>${data.valoracionGlobal}/5</strong></p>
${emailButton(data.auditUrl, 'Ver auditoría')}`;
      const bodyText = `El cliente ${data.clienteNombre} respondió la encuesta de ${data.auditRef}.
Valoración global: ${data.valoracionGlobal}/5

Ver auditoría: ${data.auditUrl}`;
      const wrapped = wrapEmailLayout({ title: subject, bodyHtml, bodyText });
      return { subject, ...wrapped };
    }
  },
  password_reset: {
    schema: passwordResetSchema,
    render: () => renderReserved('password_reset')
  },
  envio_informe_cliente: {
    schema: envioInformeClienteSchema,
    render: () => renderReserved('envio_informe_cliente')
  },
  envio_briefing_cliente: {
    schema: envioBriefingClienteSchema,
    render: () => renderReserved('envio_briefing_cliente')
  }
};
