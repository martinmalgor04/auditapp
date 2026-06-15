import type { RequestHandler } from './$types';
import { requireAdminApi } from '$lib/server/api/guards';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { detectFormat, parseCsv, parseXlsx } from '$lib/server/clients/parse';
import { planClientImport } from '$lib/server/clients/import';
import { UnsupportedFormatError } from '$lib/server/clients/errors';
import { applyClientImport } from '$lib/server/db/clients-import';

export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireAdminApi(locals);
  if (user instanceof Response) {
    return user; // R2: 401 sin sesión, 403 si rol ≠ admin
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return apiError('Falta el archivo', 400);
  }

  let format: 'csv' | 'xlsx';
  try {
    format = detectFormat(file.name, file.type); // R3/R4
  } catch (e) {
    if (e instanceof UnsupportedFormatError) {
      return apiError(e.message, 415);
    }
    throw e;
  }

  const rows =
    format === 'csv'
      ? parseCsv(await file.text())
      : parseXlsx(Buffer.from(await file.arrayBuffer()));

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const plan = planClientImport(rows, headers); // R5–R9.bis, R16, R5.ter
  const result = await applyClientImport(plan); // R10–R12, R15
  return apiSuccess(result, 200); // R13
};
