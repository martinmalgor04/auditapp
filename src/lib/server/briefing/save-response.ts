import { getClienteItemForAudit, upsertResponse } from '$lib/server/db/briefing';
import { BriefingItemNotAllowedError, BriefingUnavailableError } from './errors';
import { parseBriefingValue } from './schemas';
import { validateBriefingToken } from './validate-token';

export async function saveBriefingResponse(
  token: string,
  itemId: string,
  payload: { value: unknown; na?: boolean }
): Promise<{ updatedAt: string }> {
  const ctx = await validateBriefingToken(token);
  const item = await getClienteItemForAudit(ctx.audit.id, itemId);

  if (!item || item.filled_by !== 'cliente') {
    throw new BriefingItemNotAllowedError();
  }

  if (ctx.audit.status !== 'briefing_enviado' && ctx.audit.status !== 'briefing_completo') {
    throw new BriefingUnavailableError();
  }

  const na = payload.na ?? false;
  const value = parseBriefingValue(item.field_type, item.options, payload.value, na);

  return upsertResponse(ctx.audit.id, itemId, value, na);
}
