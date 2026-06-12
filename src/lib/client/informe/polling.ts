/** Polling del estado del informe cada 3 s mientras pendiente|generando (R15). */

export type ReportStatusPayload = {
  report_id: string;
  version: number;
  status: string;
  error_message: string | null;
};

const INFLIGHT = new Set(['pendiente', 'generando']);

export function startReportPolling(
  auditId: string,
  version: number,
  onUpdate: (payload: ReportStatusPayload) => void,
  intervalMs = 3000
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      const res = await fetch(`/api/audits/${auditId}/report/${version}/status`);
      if (res.ok) {
        const body = (await res.json()) as { data: ReportStatusPayload };
        onUpdate(body.data);
        if (!INFLIGHT.has(body.data.status)) {
          stopped = true;
          return;
        }
      }
    } catch {
      // reintenta en el próximo tick
    }
    timer = setTimeout(tick, intervalMs);
  }

  timer = setTimeout(tick, intervalMs);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
