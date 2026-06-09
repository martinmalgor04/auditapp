import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getTemplateById, updateTemplateItem } from '$lib/server/backoffice/templates';
import { requireAdminPage, failFromError } from '$lib/server/backoffice/route-helpers';

export const load: PageServerLoad = async ({ locals, params }) => {
  requireAdminPage(locals);

  const template = await getTemplateById(params.id);
  if (!template) {
    error(404, 'Plantilla no encontrada');
  }

  return { template };
};

export const actions: Actions = {
  updateItem: async ({ request, locals }) => {
    requireAdminPage(locals);

    try {
      const formData = await request.formData();
      const methodRaw = String(formData.get('method') ?? '');
      const method = methodRaw
        .split(',')
        .map((m) => m.trim())
        .filter((m) => ['O', 'E', 'C', 'X'].includes(m)) as Array<'O' | 'E' | 'C' | 'X'>;

      let options: Record<string, unknown> = {};
      const optionsRaw = String(formData.get('options') ?? '{}');
      try {
        options = JSON.parse(optionsRaw) as Record<string, unknown>;
      } catch {
        return fail(400, { error: 'Options JSON inválido' });
      }

      await updateTemplateItem({
        itemId: String(formData.get('itemId') ?? ''),
        label: String(formData.get('label') ?? ''),
        help: String(formData.get('help') ?? '') || null,
        options,
        method,
        filled_by: String(formData.get('filled_by') ?? 'admin') as 'admin' | 'cliente' | 'tecnico'
      });

      return { success: true };
    } catch (e) {
      return failFromError(e);
    }
  },

  createSection: async ({ locals }) => {
    requireAdminPage(locals);
    return fail(404, { error: 'No disponible en v1' });
  },

  createItem: async ({ locals }) => {
    requireAdminPage(locals);
    return fail(404, { error: 'No disponible en v1' });
  }
};
