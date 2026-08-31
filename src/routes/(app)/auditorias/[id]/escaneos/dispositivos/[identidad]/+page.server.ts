import { error } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
import type { AppUser } from '$lib/server/auth/types';
import { getAuditById } from '$lib/server/backoffice/audits';
import { ForbiddenError, ValidationError } from '$lib/server/backoffice/errors';
import { failFromEscaneoError } from '$lib/server/escaneos/fail-from-error';
import { techIsAssigned } from '$lib/server/db/audit-assignment';
import { getSql } from '$lib/server/db/client';
import {
  listarFilasInventarioManual,
  obtenerDispositivoConsolidado
} from '$lib/server/escaneos/consolidado';
import { EscaneoNotFoundError } from '$lib/server/escaneos/errors';
import {
  desvincularDispositivo,
  fusionarDispositivo,
  marcarRevisionGrupo
} from '$lib/server/escaneos/revision';
import { fusionarDispositivoInput, marcarRevisionGrupoInput } from '$lib/server/escaneos/schemas';

async function assertAdminOrAssigned(auditId: string, user: AppUser): Promise<void> {
  if (user.role === 'admin') return;
  if (!(await techIsAssigned(auditId, user.id))) {
    throw new ForbiddenError('No tenés permiso para modificar esta auditoría');
  }
}

function parseCon<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  }
  return parsed.data;
}

function notaDe(formData: FormData): string | null {
  const raw = String(formData.get('nota') ?? '').trim();
  return raw === '' ? null : raw;
}

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = requireStaff(locals);
  const audit = await getAuditById(params.id, user);
  if (!audit) {
    error(404, 'Auditoría no encontrada');
  }
  // R2/R3: lectura solo para admin o técnico asignado (patrón #33/#57)
  if (user.role !== 'admin' && !(await techIsAssigned(audit.id, user.id))) {
    error(403, 'No tenés permiso para ver los escaneos de esta auditoría');
  }

  const empresaId = audit.clientId;
  let dispositivo;
  try {
    dispositivo = await obtenerDispositivoConsolidado(empresaId, audit.id, params.identidad);
  } catch (e) {
    if (e instanceof EscaneoNotFoundError) {
      error(404, 'Dispositivo no encontrado');
    }
    throw e;
  }
  const filasInventario = await listarFilasInventarioManual(empresaId, audit.id);

  // Nombre legible del revisor efectivo (R13: quién y cuándo)
  let revisadoPorNombre: string | null = null;
  if (dispositivo.revisadoPor) {
    const sql = getSql();
    const [u] = await sql<{ name: string }[]>`
      SELECT name FROM app_user WHERE id = ${dispositivo.revisadoPor}
    `;
    revisadoPorNombre = u?.name ?? null;
  }

  return {
    audit: {
      id: audit.id,
      refCode: audit.refCode,
      razonSocial: audit.razonSocial,
      status: audit.status
    },
    // R4 (puerta 2026-08-30): la revisión opera también con auditoría cerrada
    cerrada: audit.status === 'cerrada',
    dispositivo: {
      ...dispositivo,
      vistoAt: dispositivo.vistoAt?.toISOString() ?? null,
      revisadoAt: dispositivo.revisadoAt?.toISOString() ?? null,
      ocurrencias: dispositivo.ocurrencias.map((o) => ({
        ...o,
        vistoAt: o.vistoAt?.toISOString() ?? null
      })),
      ocurrenciasRaw: dispositivo.ocurrenciasRaw.map((o) => ({
        ...o,
        vistoAt: o.vistoAt?.toISOString() ?? null
      }))
    },
    revisadoPorNombre,
    filasInventario
  };
};

export const actions: Actions = {
  // R20: confirmar con nota opcional. Permitido con auditoría cerrada (R4).
  confirmar: async ({ request, locals, params }) => {
    const user = requireStaff(locals);
    try {
      await assertAdminOrAssigned(params.id, user);
      const audit = await getAuditById(params.id, user);
      if (!audit) throw new ForbiddenError('Auditoría no encontrada');
      const formData = await request.formData();
      await marcarRevisionGrupo(
        audit.clientId,
        audit.id,
        params.identidad,
        'confirmado',
        user.id,
        notaDe(formData)
      );
      return { success: true, revision: 'confirmado' };
    } catch (e) {
      return failFromEscaneoError(e);
    }
  },

  // R20: descartar con nota opcional
  descartar: async ({ request, locals, params }) => {
    const user = requireStaff(locals);
    try {
      await assertAdminOrAssigned(params.id, user);
      const audit = await getAuditById(params.id, user);
      if (!audit) throw new ForbiddenError('Auditoría no encontrada');
      const formData = await request.formData();
      await marcarRevisionGrupo(
        audit.clientId,
        audit.id,
        params.identidad,
        'descartado',
        user.id,
        notaDe(formData)
      );
      return { success: true, revision: 'descartado' };
    } catch (e) {
      return failFromEscaneoError(e);
    }
  },

  // R26: revertir a sin_revisar limpia revisor y fecha del grupo
  volverASinRevisar: async ({ locals, params }) => {
    const user = requireStaff(locals);
    try {
      await assertAdminOrAssigned(params.id, user);
      const audit = await getAuditById(params.id, user);
      if (!audit) throw new ForbiddenError('Auditoría no encontrada');
      await marcarRevisionGrupo(audit.clientId, audit.id, params.identidad, 'sin_revisar', user.id);
      return { success: true, revision: 'sin_revisar' };
    } catch (e) {
      return failFromEscaneoError(e);
    }
  },

  // R21/R22: fusionar con una fila del relevamiento manual (nunca la escribe, R23)
  fusionar: async ({ request, locals, params }) => {
    const user = requireStaff(locals);
    try {
      await assertAdminOrAssigned(params.id, user);
      const audit = await getAuditById(params.id, user);
      if (!audit) throw new ForbiddenError('Auditoría no encontrada');
      const formData = await request.formData();
      const input = parseCon(fusionarDispositivoInput, {
        identidad: params.identidad,
        itemId: String(formData.get('itemId') ?? ''),
        rowId: String(formData.get('rowId') ?? ''),
        nota: notaDe(formData)
      });
      await fusionarDispositivo(
        audit.clientId,
        audit.id,
        input.identidad,
        input.itemId,
        input.rowId,
        user.id,
        input.nota
      );
      return { success: true, revision: 'fusionado' };
    } catch (e) {
      return failFromEscaneoError(e);
    }
  },

  // R24: desvincular limpia el vínculo y vuelve a sin_revisar
  desvincular: async ({ locals, params }) => {
    const user = requireStaff(locals);
    try {
      await assertAdminOrAssigned(params.id, user);
      const audit = await getAuditById(params.id, user);
      if (!audit) throw new ForbiddenError('Auditoría no encontrada');
      await desvincularDispositivo(audit.clientId, audit.id, params.identidad);
      return { success: true, revision: 'sin_revisar' };
    } catch (e) {
      return failFromEscaneoError(e);
    }
  }
};
