import type { PushEventName, PushPayload } from './index';

type PushPayloadData = {
  auditRef: string;
  clienteNombre: string;
  auditUrl: string;
  version?: number;
  valoracionGlobal?: number;
};

/** Construye el payload branded SyS para cada evento de push. R7, R9 */
export function buildPushPayload(event: PushEventName, data: PushPayloadData): PushPayload {
  const { auditRef, clienteNombre, auditUrl } = data;
  const tag = `${event}:${auditRef}`;

  switch (event) {
    case 'aviso_auditoria_asignada':
      return {
        event,
        title: 'SyS · Auditoría asignada',
        body: `Se te asignó la auditoría ${auditRef} — ${clienteNombre}`,
        url: auditUrl,
        tag
      };
    case 'aviso_briefing_completado':
      return {
        event,
        title: 'SyS · Briefing completado',
        body: `Briefing completado para ${auditRef} — ${clienteNombre}`,
        url: auditUrl,
        tag
      };
    case 'aviso_informe_aprobado':
      return {
        event,
        title: 'SyS · Informe aprobado',
        body: `Informe aprobado${data.version ? ` v${data.version}` : ''} — ${auditRef} · ${clienteNombre}`,
        url: auditUrl,
        tag
      };
    case 'aviso_auditoria_cerrada':
      return {
        event,
        title: 'SyS · Auditoría cerrada',
        body: `La auditoría ${auditRef} — ${clienteNombre} fue cerrada`,
        url: auditUrl,
        tag
      };
    case 'aviso_feedback_cliente':
      return {
        event,
        title: 'SyS · Feedback del cliente',
        body: `Nuevo feedback${data.valoracionGlobal !== undefined ? ` (${data.valoracionGlobal}/5)` : ''} en ${auditRef} — ${clienteNombre}`,
        url: auditUrl,
        tag
      };
  }
}
