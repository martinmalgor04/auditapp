/**
 * #51 — Envío del informe al cliente por email.
 *
 * Arma el share activo (reuso #15), envía la plantilla `envio_informe_cliente` (#49)
 * y expone la marca de "enviado" derivada de `email_log` (#49).
 */
import { z } from 'zod';
import { sendEmail } from '$lib/server/email/index';
import { createReportShare, buildShareUrl, INFORME_SHARE_DEFAULT_DAYS } from './share';
import { getActiveShareByReport } from '$lib/server/db/informe-shares';
import { listEmailLogByTemplate } from '$lib/server/db/email-log';
import type { AuditReportRow } from '$lib/server/db/informe-reports';

// R3: schema de validación del destinatario
export const enviarInformeSchema = z.object({ to: z.string().email() }).strict();

export type EnviarInformeResult =
  | { ok: true; status: 'enviado' | 'dry_run'; to: string }
  | { ok: false; status: 'fallido'; error: string }; // error genérico, sin SMTP_*

export type InformeEnvio = { toEmail: string; status: string; at: string }; // ISO

/**
 * Envía el informe aprobado al contacto de la empresa (R2, R3, R4, R7, R8).
 *
 * Pre-condición: `report.status === 'aprobado'` (garantizado por el caller, R2).
 * `to` ya validado con `enviarInformeSchema` (R3).
 */
export async function enviarInforme(input: {
  report: AuditReportRow; // status === 'aprobado' garantizado (R2)
  empresaNombre: string;
  to: string; // ya validado (R3)
  userId: string; // createdBy del share si hay que crearlo
}): Promise<EnviarInformeResult> {
  const { report, empresaNombre, to, userId } = input;

  // R4: asegurar share activo (reuso #15); si no existe, crear uno
  let share = await getActiveShareByReport(report.id);
  if (!share) {
    share = await createReportShare({
      reportId: report.id,
      createdBy: userId,
      expiresInDays: INFORME_SHARE_DEFAULT_DAYS
    });
  }

  const informeUrl = buildShareUrl(share.token);
  const pdfUrl = `${informeUrl}/imprimir`;

  // R4: data sin material interno (solo contactoNombre, informeUrl, pdfUrl)
  const data = {
    contactoNombre: empresaNombre,
    informeUrl,
    pdfUrl
  };

  const result = await sendEmail('envio_informe_cliente', to, data);

  if (result.status === 'fallido') {
    // R8: mensaje genérico, sin filtrar detalles SMTP
    return { ok: false, status: 'fallido', error: 'No se pudo enviar el informe por email' };
  }

  return { ok: true, status: result.status as 'enviado' | 'dry_run', to };
}

/**
 * Lista los envíos del informe al cliente derivados de `email_log` (R7).
 *
 * Como `email_log` no guarda `report_id`, se acota por `to_email` de la empresa
 * (suficiente para el acceptance: a quién y cuándo).
 */
export async function listInformeEnvios(
  _reportId: string,
  empresaEmail: string | null
): Promise<InformeEnvio[]> {
  if (!empresaEmail) return [];

  const rows = await listEmailLogByTemplate('envio_informe_cliente');
  return rows
    .filter((r) => r.toEmail === empresaEmail)
    .map((r) => ({
      toEmail: r.toEmail,
      status: r.status,
      at: (r.sentAt ?? r.createdAt).toISOString()
    }));
}
