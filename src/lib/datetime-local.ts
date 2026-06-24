const DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Valor para `<input type="datetime-local">` en hora local. */
export function toDatetimeLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isDatetimeLocal(value: string): boolean {
  return DATETIME_LOCAL_RE.test(value);
}

/** Convierte datetime-local a ISO 8601 con offset de la zona horaria local. */
export function datetimeLocalToIsoOffset(value: string): string {
  const d = new Date(value);
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const oh = pad(Math.floor(abs / 60));
  const om = pad(abs % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${oh}:${om}`;
}

/**
 * Normaliza input de formulario (datetime-local o ISO con offset).
 * `undefined` = campo ausente; `null` = vacío explícito.
 */
export function normalizeDatetimeInput(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === '') return null;
  if (isDatetimeLocal(value)) return datetimeLocalToIsoOffset(value);
  return value;
}
