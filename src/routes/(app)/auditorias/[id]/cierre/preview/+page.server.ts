import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
import { loadClosurePage } from '$lib/server/closure/load-closure';
import { buildCanonicalAuditJson } from '$lib/server/canonical/build';
import { buildClientReportPreview } from '$lib/server/canonical/preview';
import { BackofficeError } from '$lib/server/backoffice/errors';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = requireStaff(locals);

  try {
    await loadClosurePage(params.id, user);
    const canonical = await buildCanonicalAuditJson(params.id);
    const preview = buildClientReportPreview(canonical);
    return { preview, auditId: params.id };
  } catch (e) {
    if (e instanceof BackofficeError) {
      error(e.status, e.message);
    }
    throw e;
  }
};
