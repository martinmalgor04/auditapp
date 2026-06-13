import type { RenderSemaphore } from '$lib/informe/render';

/** Largo del arco del gauge del template web v2 (stroke-dasharray base). */
export const WEB_GAUGE_CIRCUMFERENCE = 276.5;

/** Color del gauge/badge SIEMPRE derivado del semáforo canónico (R10). */
export function webGaugeColorVar(semaforo: RenderSemaphore): string {
  if (semaforo === 'green') return 'var(--sys-verde)';
  if (semaforo === 'amber') return 'var(--sys-naranja)';
  return 'var(--sys-rojo)';
}

/** Etiqueta del badge del template: rojo CRÍTICO · naranja REGULAR · verde BUENO. */
export function webGaugeBadgeLabel(semaforo: RenderSemaphore): string {
  if (semaforo === 'green') return 'BUENO';
  if (semaforo === 'amber') return 'REGULAR';
  return 'CRÍTICO';
}

/** stroke-dashoffset final del arco para un índice 0–100. */
export function webGaugeDashoffset(valor: number): number {
  const clamped = Math.max(0, Math.min(100, valor));
  return Number((WEB_GAUGE_CIRCUMFERENCE * (1 - clamped / 100)).toFixed(1));
}

function animateNumber(el: Element, target: number, durationMs: number): void {
  const suffix = el.querySelector('span');
  const suffixHtml = suffix ? suffix.outerHTML : '';
  const t0 = performance.now();
  function tick(t: number): void {
    const p = Math.min((t - t0) / durationMs, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.innerHTML = `${Math.round(eased * target)}${suffixHtml}`;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function animateCount(el: HTMLElement): void {
  if (el.dataset.done) return;
  el.dataset.done = '1';
  const target = parseInt(el.dataset.count ?? '0', 10) || 0;
  animateNumber(el, target, 1100);
}

function startGauge(root: ParentNode): void {
  const wrap = root.querySelector<HTMLElement>('[data-gauge-score]');
  if (!wrap) return;
  const score = parseInt(wrap.dataset.gaugeScore ?? '0', 10) || 0;
  const arc = wrap.querySelector<SVGPathElement>('[data-gauge-arc]');
  const num = wrap.querySelector<SVGTextElement>('[data-gauge-num]');
  window.setTimeout(() => {
    if (arc) arc.style.strokeDashoffset = String(webGaugeDashoffset(score));
    if (num) {
      const t0 = performance.now();
      const dur = 1800;
      function tick(t: number): void {
        const p = Math.min((t - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        num!.textContent = String(Math.round(eased * score));
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
  }, 350);
}

/**
 * Efectos del template web v2 (R10): barra de progreso de scroll, reveal on
 * scroll (IntersectionObserver), contadores data-count, barras data-w y gauge.
 * Devuelve cleanup para desmontar.
 */
export function initInformeWebEffects(root: ParentNode = document): () => void {
  const prog = root.querySelector<HTMLElement>('[data-informe-prog]');
  const onScroll = (): void => {
    if (!prog) return;
    const s = document.documentElement;
    const pct = (s.scrollTop / (s.scrollHeight - s.clientHeight)) * 100;
    prog.style.width = `${pct}%`;
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        entry.target.querySelectorAll<HTMLElement>('.bar i').forEach((b) => {
          b.style.width = `${b.dataset.w ?? 0}%`;
        });
        entry.target.querySelectorAll<HTMLElement>('[data-count]').forEach(animateCount);
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.2 }
  );
  root.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  startGauge(root);

  return () => {
    window.removeEventListener('scroll', onScroll);
    io.disconnect();
  };
}
