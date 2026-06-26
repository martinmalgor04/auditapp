import { updateAuditStatus } from '$lib/server/db/briefing';
import { onBriefingCompletado } from '$lib/server/email/notify';
import { BriefingUnavailableError } from './errors';
import { validateBriefingToken } from './validate-token';

export async function submitBriefing(token: string): Promise<void> {
  const ctx = await validateBriefingToken(token);

  if (ctx.audit.status === 'briefing_completo') {
    return;
  }

  if (ctx.audit.status !== 'briefing_enviado') {
    throw new BriefingUnavailableError();
  }

  await updateAuditStatus(ctx.audit.id, 'briefing_completo');
  void onBriefingCompletado(ctx.audit.id);
}
