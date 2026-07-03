import type { RequestEvent } from '@sveltejs/kit';
import { resolveShareByToken } from './share';
import { getReportManualHtml } from '../db/informe-reports';
import { registerShareView } from '../db/informe-shares';

/**
 * Interceptor para servir documentos HTML manuales directamente sin pasar por Svelte.
 * Matchea ^/informe/[^/]+(/imprimir)?$ con GET y delega si report.source='manual' (R18–R27, D2).
 *
 * Retorna Response para servir, o null para dejar que la página Svelte se encargue.
 */
export async function handleManualInformeRequest(event: RequestEvent): Promise<Response | null> {
  const { request, url, route } = event;

  // Solo GET a rutas de informe público
  if (request.method !== 'GET') {
    return null;
  }

  const pathname = url.pathname;
  const tokenMatch = pathname.match(/^\/informe\/([^/]+)(?:\/imprimir)?$/);
  if (!tokenMatch) {
    return null;
  }

  const token = tokenMatch[1];
  const isImprimir = pathname.includes('/imprimir');

  try {
    // Resolver share (R15 de #15)
    const shareOrResponse = await resolveShareByToken(token);
    if (!shareOrResponse.ok) {
      return null; // token inválido/revocado/expirado: deja que la página lo maneje
    }

    const { share, report } = shareOrResponse;

    // Solo delegar si es manual (R28: no-regresión para IA)
    if (report.source !== 'manual') {
      return null; // deja que la página Svelte se encargue
    }

    // R27: /imprimir → redirect a /informe/[token]
    if (isImprimir) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: `/informe/${token}`
        }
      });
    }

    // Obtener HTML manual (R18)
    const htmlManual = await getReportManualHtml(report.id);
    if (!htmlManual) {
      // No debería pasar (source='manual' garantiza html_manual), pero fail-safe
      return new Response('Documento no disponible', { status: 500 });
    }

    // Inyectar encuesta (R20)
    const docWithSurvey = injectSurveyBeforeBodyClose(
      htmlManual,
      token,
      { id: share.id }
    );

    // Registrar vista (R26)
    await registerShareView(share.id);

    // Servir documento (R18, R26)
    return new Response(docWithSurvey, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    });
  } catch (err) {
    console.error('[manual-serve]', err);
    return null; // deja que la página maneje el error
  }
}

/**
 * Inyecta el bloque de encuesta antes de la última ocurrencia de `</body>` (R20).
 * Si no existe </body>, devuelve el documento sin cambios (las validaciones previas aseguran que existe).
 */
export function injectSurveyBeforeBodyClose(
  html: string,
  token: string,
  share: { id: string; respondedAt?: Date | null }
): string {
  const bodyCloseIndex = html.toLowerCase().lastIndexOf('</body>');
  if (bodyCloseIndex === -1) {
    // No debería pasar (validado en upload), retorna sin cambios
    return html;
  }

  const surveyBlock = buildSurveyBlock(token, share.respondedAt);

  // Insertar antes del </body> original
  return html.slice(0, bodyCloseIndex) + surveyBlock + html.slice(bodyCloseIndex);
}

/**
 * Construye el bloque de encuesta HTML plano (R22–R24).
 * Si ya respondió, muestra estado "respondida" en lugar de form.
 */
function buildSurveyBlock(token: string, respondedAt?: Date | null): string {
  const containerStyle = `
    style="
      margin-top: 3rem;
      padding: 2rem;
      background: #f5f5f5;
      border-top: 1px solid #ddd;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
    "
  `;

  if (respondedAt) {
    // R24: estado "respondida"
    return `
      <div ${containerStyle}>
        <h3 style="margin-top: 0; color: #333;">Encuesta de conformidad</h3>
        <p style="color: #666; margin: 0;">
          Gracias por responder la encuesta. Tu feedback es importante.
        </p>
      </div>
    `;
  }

  // R22: form plano sin JavaScript
  return `
    <div ${containerStyle}>
      <h3 style="margin-top: 0; color: #333;">¿Qué te pareció el informe?</h3>
      <form method="POST" action="/informe/${token}/encuesta" style="display: flex; flex-direction: column; gap: 1rem;">
        <div>
          <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">
            Valoración global
          </label>
          <select name="valoracion_global" required style="width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;">
            <option value="">Seleccionar…</option>
            <option value="muy_satisfecho">Muy satisfecho</option>
            <option value="satisfecho">Satisfecho</option>
            <option value="neutral">Neutral</option>
            <option value="insatisfecho">Insatisfecho</option>
          </select>
        </div>
        <div>
          <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">
            Claridad del informe
          </label>
          <select name="claridad_informe" required style="width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;">
            <option value="">Seleccionar…</option>
            <option value="muy_clara">Muy clara</option>
            <option value="clara">Clara</option>
            <option value="poco_clara">Poco clara</option>
            <option value="confusa">Confusa</option>
          </select>
        </div>
        <div>
          <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">
            ¿Conforme con los hallazgos?
          </label>
          <select name="conforme_hallazgos" required style="width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;">
            <option value="">Seleccionar…</option>
            <option value="totalmente_conforme">Totalmente conforme</option>
            <option value="conforme">Conforme</option>
            <option value="parcialmente_conforme">Parcialmente conforme</option>
            <option value="disconforme">Disconforme</option>
          </select>
        </div>
        <div>
          <label style="display: block; font-weight: 500; margin-bottom: 0.5rem;">
            Comentarios (opcional)
          </label>
          <textarea name="comentario" style="width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-family: inherit; resize: vertical; min-height: 80px;"></textarea>
        </div>
        <button type="submit" style="padding: 0.75rem 1.5rem; background: #0066cc; color: white; border: none; border-radius: 4px; font-weight: 500; cursor: pointer;">
          Enviar
        </button>
      </form>
    </div>
  `;
}
