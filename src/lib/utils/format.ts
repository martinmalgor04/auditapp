export function formatDate(d: Date | string | null): string {
  return d ? new Date(d).toLocaleDateString('es-AR') : '—';
}

export function formatDateTime(d: Date | string | null): string {
  return d ? new Date(d).toLocaleString('es-AR') : '—';
}
