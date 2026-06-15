import type { AppUser } from '$lib/server/auth/types';
import { insertReunionSession } from '$lib/server/db/reunion-sessions';
import { assertReunionAccess, assertReunionEditableStatus } from './guards';
import type { ReunionConsentInput } from './schemas';

export async function createReunionSession(
  auditId: string,
  user: AppUser,
  input: ReunionConsentInput
): Promise<{ sessionId: string }> {
  const audit = await assertReunionAccess(auditId, user);
  assertReunionEditableStatus(audit.status);

  const sessionId = await insertReunionSession({
    auditId,
    startedBy: user.id,
    sessionType: input.session_type,
    consentRecordedAt: input.consent_recorded_at,
    consentNote: input.consent_note
  });

  return { sessionId };
}
