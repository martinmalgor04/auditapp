import {
  renderHallazgosItPage,
  renderMejorasItPage
} from './render-it';
import {
  renderDiaADiaErpPage,
  renderHallazgosErpPage,
  renderPortadaMixta,
  renderResumenMixto
} from './render-mixto-parts';
import {
  renderCierrePage,
  renderLoomBlock,
  renderPlanPage,
  renderRiesgosPage,
  wrapInforme,
  type InformeRenderModel,
  type RenderOptions
} from './render-shared';

export function renderInformeMixto(model: InformeRenderModel, opts: RenderOptions = {}): string {
  const pages = [
    renderPortadaMixta(model),
    renderResumenMixto(model, opts),
    renderHallazgosItPage(model, opts, '03'),
    renderHallazgosErpPage(model, opts, '04'),
    renderMejorasItPage(model, opts, '05', '04 · Mejoras prioritarias por área'),
    renderRiesgosPage(model, opts, '06', '05 · Riesgos priorizados'),
    renderPlanPage(model, opts, '07', '06 · Recomendación y plan'),
    renderDiaADiaErpPage(model, opts, '08', '07 · Qué cambia en el día a día'),
    renderCierrePage(model, opts, '07 · Próximos pasos')
  ].join('');

  return wrapInforme('mixta', pages, renderLoomBlock(model));
}
