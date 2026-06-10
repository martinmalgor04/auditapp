import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authenticate } from '$lib/server/auth/login';
import {
  createUser,
  generateTemporaryPassword,
  listUsers,
  resetUserPassword,
  setUserActive,
  updateUser
} from '$lib/server/backoffice/users';
import type { AuditType } from '$lib/audit-types';
import { parseAuditTypes } from '$lib/audit-types';
import { requireAdminPage, failFromError } from '$lib/server/backoffice/route-helpers';

function auditTypesFromForm(formData: FormData): AuditType[] {
  return parseAuditTypes(formData.getAll('auditTypes').map(String));
}

export const load: PageServerLoad = async ({ locals }) => {
  requireAdminPage(locals);
  const users = await listUsers();
  return { users };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    requireAdminPage(locals);

    try {
      const formData = await request.formData();
      const temporaryPassword =
        String(formData.get('temporaryPassword') ?? '') || generateTemporaryPassword();

      const { id } = await createUser({
        email: String(formData.get('email') ?? ''),
        name: String(formData.get('name') ?? ''),
        role: String(formData.get('role') ?? 'tecnico') as 'admin' | 'tecnico',
        temporaryPassword,
        auditTypes: auditTypesFromForm(formData)
      });

      return { success: true, userId: id, temporaryPassword };
    } catch (e) {
      return failFromError(e);
    }
  },

  update: async ({ request, locals }) => {
    requireAdminPage(locals);

    try {
      const formData = await request.formData();
      await updateUser({
        userId: String(formData.get('userId') ?? ''),
        email: String(formData.get('email') ?? ''),
        name: String(formData.get('name') ?? ''),
        role: String(formData.get('role') ?? 'tecnico') as 'admin' | 'tecnico',
        active: formData.get('active') === 'on' || formData.get('active') === 'true',
        auditTypes: auditTypesFromForm(formData)
      });
      return { success: true };
    } catch (e) {
      return failFromError(e);
    }
  },

  deactivate: async ({ request, locals }) => {
    requireAdminPage(locals);

    try {
      const formData = await request.formData();
      await setUserActive(String(formData.get('userId') ?? ''), false);
      return { success: true };
    } catch (e) {
      return failFromError(e);
    }
  },

  resetPassword: async ({ request, locals }) => {
    requireAdminPage(locals);

    try {
      const formData = await request.formData();
      const temporaryPassword =
        String(formData.get('temporaryPassword') ?? '') || generateTemporaryPassword();

      await resetUserPassword({
        userId: String(formData.get('userId') ?? ''),
        temporaryPassword
      });

      const email = String(formData.get('email') ?? '');
      const loginCheck = await authenticate(email, temporaryPassword);

      return {
        success: true,
        temporaryPassword,
        loginOk: loginCheck.ok
      };
    } catch (e) {
      return failFromError(e);
    }
  }
};
