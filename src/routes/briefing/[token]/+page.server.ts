import type { PageServerLoad } from './$types';
import {
  BRIEFING_UNAVAILABLE_MESSAGE,
  resolveBriefingByToken
} from '$lib/server/auth/briefing-token';

export const load: PageServerLoad = async ({ params }) => {
  const result = await resolveBriefingByToken(params.token);

  if (!result.ok) {
    return {
      available: false as const,
      message: BRIEFING_UNAVAILABLE_MESSAGE
    };
  }

  return {
    available: true as const,
    audit: result.audit
  };
};
