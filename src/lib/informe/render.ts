/**
 * Render imprimible del informe IA (R26, #19): despachador por tipoAuditoria.
 * API pública intacta para report-render.svelte, inline editor e impresión.
 */

export {
  LOGO_VERT_URL,
  LOGO_COLOR_URL,
  escapeHtml,
  gaugeDasharray,
  semaphoreToDotClass,
  semaphoreToNumClass,
  type RenderSemaphore,
  type RenderClientDraft,
  type InformeRenderModel,
  type RenderOptions
} from './render-shared';

import { renderInformeErp } from './render-erp';
import { renderInformeIt } from './render-it';
import { renderInformeMixto } from './render-mixto';
import type { InformeRenderModel, RenderOptions } from './render-shared';

export function renderInformeHtml(model: InformeRenderModel, opts: RenderOptions = {}): string {
  switch (model.tipoAuditoria) {
    case 'it':
      return renderInformeIt(model, opts);
    case 'mixta':
      return renderInformeMixto(model, opts);
    default:
      return renderInformeErp(model, opts);
  }
}
