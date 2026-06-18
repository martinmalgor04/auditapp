/**
 * Utilidades puras para el bloque de visita (hora inicio/fin del relevamiento).
 * Sin dependencias de servidor. Usadas por el render del informe y la UI de detalle.
 */

const TZ = 'America/Argentina/Buenos_Aires';

export type VisitaDisplay = {
  /** "14/06 09:30–11:15 · 1h 45m" o "14/06 09:30" cuando no hay fin */
  rangoStr: string;
  /** "14/06 09:30" */
  inicioStr: string;
  /** "11:15" o "" cuando no hay fin */
  finStr: string;
  /** 0 cuando no hay fin */
  duracionMin: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDatetime(d: Date): { ddmm: string; hhmm: string } {
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ,
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';

  const day = pad2(Number(get('day')));
  const month = pad2(Number(get('month')));
  const hour = pad2(Number(get('hour')));
  const minute = pad2(Number(get('minute')));

  return { ddmm: `${day}/${month}`, hhmm: `${hour}:${minute}` };
}

/**
 * Formatea la duración en minutos como "1h 45m", "1h", "45m".
 */
export function formatDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h > 0 && m > 0) return `${h}h ${pad2(m)}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Construye el VisitaDisplay a partir de las fechas de inicio/fin.
 * Retorna null cuando startedAt es null (R13).
 * Cuando finishedAt es null, retorna objeto con finStr: '' y duracionMin: 0 (R12).
 */
export function formatVisita(opts: {
  startedAt: Date | null;
  finishedAt: Date | null;
}): VisitaDisplay | null {
  const { startedAt, finishedAt } = opts;

  if (!startedAt) {
    return null;
  }

  const ini = formatDatetime(startedAt);
  const inicioStr = `${ini.ddmm} ${ini.hhmm}`;

  if (!finishedAt) {
    return {
      rangoStr: `Inicio: ${inicioStr}`,
      inicioStr,
      finStr: '',
      duracionMin: 0
    };
  }

  const fin = formatDatetime(finishedAt);
  const finStr = fin.hhmm;
  const duracionMin = Math.max(0, Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000));
  const durStr = formatDuracion(duracionMin);
  const rangoStr = `Visita: ${inicioStr}–${finStr} · ${durStr}`;

  return {
    rangoStr,
    inicioStr,
    finStr,
    duracionMin
  };
}
