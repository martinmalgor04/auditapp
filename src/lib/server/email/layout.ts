/** Layout HTML branded SyS email-safe (inline) + versión texto plano (#49 R5, #11). */

const BRAND = {
  primary: '#2196F3',
  navy: '#0A1929',
  navyMid: '#0E2540',
  surface: '#ffffff',
  border: '#E4E7ED',
  textPrimary: '#0A1929',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  textNavyMuted: '#A2C6D4'
} as const;

export type LayoutContent = {
  title: string;
  preheader?: string;
  bodyHtml: string;
  bodyText: string;
};

export function wrapEmailLayout(content: LayoutContent): { html: string; text: string } {
  const preheader = content.preheader ?? content.title;
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(content.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#ECEEF2;font-family:Montserrat,'Segoe UI',Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;color:transparent;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ECEEF2;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:${BRAND.navy};padding:20px 24px;">
              <p style="margin:0;font-size:18px;font-weight:700;color:${BRAND.textNavyMuted};letter-spacing:0.02em;">Servicios y Sistemas</p>
              <p style="margin:6px 0 0;font-size:13px;color:${BRAND.textNavyMuted};">Auditapp — auditorías IT/ERP</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px;color:${BRAND.textPrimary};font-size:15px;line-height:1.55;">
              <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${BRAND.navy};">${escapeHtml(content.title)}</h1>
              ${content.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;border-top:1px solid ${BRAND.border};background-color:#F9FAFB;">
              <p style="margin:0;font-size:12px;color:${BRAND.textMuted};">
                Servicios y Sistemas SA · NEA, Argentina<br />
                Este es un aviso automático de Auditapp.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `${content.title}

${content.bodyText}

---
Servicios y Sistemas SA · Auditapp
Aviso automático`;

  return { html, text };
}

export function emailButton(href: string, label: string): string {
  return `<p style="margin:24px 0 0;">
  <a href="${escapeAttr(href)}" style="display:inline-block;background-color:${BRAND.primary};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;font-size:14px;">${escapeHtml(label)}</a>
</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
