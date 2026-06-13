import { PsysConfigError, PsysRemoteError } from './errors';
import {
  psysProposalRefSchema,
  psysProposalResponseSchema,
  type PsysProposalPayload,
  type PsysProposalRef
} from './schemas';

const PSYS_TIMEOUT_MS = 10_000;

type PsysConfig = { url: string; key: string };

export function resolvePsysConfig(): PsysConfig {
  const url = process.env.PSYS_API_URL?.trim();
  const key = process.env.PSYS_API_KEY?.trim();
  if (!url || !key) {
    throw new PsysConfigError();
  }
  return { url: url.replace(/\/$/, ''), key };
}

async function psysFetch(path: string, init: RequestInit): Promise<Response> {
  const { url, key } = resolvePsysConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PSYS_TIMEOUT_MS);
  try {
    return await fetch(`${url}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        ...(init.headers ?? {})
      }
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new PsysRemoteError('Tiempo de espera agotado al contactar presupuestossys');
    }
    throw new PsysRemoteError('No se pudo contactar presupuestossys');
  } finally {
    clearTimeout(timer);
  }
}

function parseProposalResponse(body: unknown): PsysProposalRef {
  const parsed = psysProposalResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new PsysRemoteError('Respuesta inválida de presupuestossys');
  }
  return parsed.data.proposal;
}

function remoteErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const message = (body as { error?: unknown }).error;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  if (status >= 500) {
    return 'presupuestossys respondió con un error interno';
  }
  return 'presupuestossys rechazó la solicitud';
}

export async function createPsysProposal(
  payload: PsysProposalPayload,
  opts: { idempotencyKey: string }
): Promise<{ proposal: PsysProposalRef; alreadyExisted: boolean }> {
  const res = await psysFetch('/api/m2m/proposals', {
    method: 'POST',
    headers: { 'Idempotency-Key': opts.idempotencyKey },
    body: JSON.stringify(payload)
  });

  if (res.status === 201) {
    const body = await res.json().catch(() => null);
    return { proposal: parseProposalResponse(body), alreadyExisted: false };
  }
  if (res.status === 200) {
    const body = await res.json().catch(() => null);
    return { proposal: parseProposalResponse(body), alreadyExisted: true };
  }

  const body = await res.json().catch(() => null);
  throw new PsysRemoteError(remoteErrorMessage(res.status, body), res.status);
}

export async function getPsysProposal(id: string): Promise<PsysProposalRef> {
  const res = await psysFetch(`/api/m2m/proposals/${id}`, { method: 'GET' });

  if (res.status === 404) {
    throw new PsysRemoteError('Presupuesto no encontrado en presupuestossys', 404);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new PsysRemoteError(remoteErrorMessage(res.status, body), res.status);
  }

  const body = await res.json().catch(() => null);
  const parsed = psysProposalResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new PsysRemoteError('Respuesta inválida de presupuestossys');
  }
  const proposal = psysProposalRefSchema.parse(parsed.data.proposal);
  return proposal;
}
