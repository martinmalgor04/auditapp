import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/auth/guards';
import type { AppUser } from '$lib/server/auth/types';
import { getAuditById } from '$lib/server/backoffice/audits';
import { ForbiddenError, ValidationError } from '$lib/server/backoffice/errors';
import { failFromEscaneoError } from '$lib/server/escaneos/fail-from-error';
import { techIsAssigned } from '$lib/server/db/audit-assignment';
import { crearEscaneo } from '$lib/server/escaneos/repo';
import {
  emitirTokenEscaneo,
  resolverAmbitoEscaneo,
  revocarTokenEscaneo
} from '$lib/server/escaneos/api';
import {
  contadoresRevisionConsolidado,
  listarConsolidado,
  listarEscaneosParaUi
} from '$lib/server/escaneos/consolidado';
import { marcarRevisionGrupo } from '$lib/server/escaneos/revision';
import {
  AGENTE_VERSION_INICIAL,
  crearEscaneoUiInput,
  filtrosConsolidadoInput,
  marcarRevisionGrupoInput
} from '$lib/server/escaneos/schemas';

const LIMIT = 100;

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

export const load: PageServerLoad = async ({ locals, params, url }) => {
  const user = requireStaff(locals);
  const audit = await getAuditById(params.id, user);
  if (!audit) {
    error(404, 'Auditoría no encontrada');
  }
  // R2/R3: lectura solo para admin o técnico asignado (patrón #33/#57)
  if (user.role !== 'admin' && !(await techIsAssigned(audit.id, user.id))) {
    error(403, 'No tenés permiso para ver los escaneos de esta auditoría');
  }

  // R32 (puerta 2026-08-30): cerrada bloquea crear escaneo/token, NO la revisión (R4)
  const cerrada = audit.status === 'cerrada';
  const filtros = filtrosConsolidadoInput.parse({
    tipo: url.searchParams.get('tipo') ?? undefined,
    revision: url.searchParams.get('revision') ?? undefined,
    escaneo: url.searchParams.get('escaneo') ?? undefined,
    page: url.searchParams.get('page') ?? undefined
  });

  const empresaId = audit.clientId;
  const [escaneos, consolidado, contadores] = await Promise.all([
    listarEscaneosParaUi(empresaId, audit.id),
    listarConsolidado(empresaId, audit.id, {
      tipo: filtros.tipo,
      revision: filtros.revision,
      escaneoId: filtros.escaneo,
      limit: LIMIT,
      offset: (filtros.page - 1) * LIMIT
    }),
    contadoresRevisionConsolidado(empresaId, audit.id)
  ]);

  return {
    audit: {
      id: audit.id,
      refCode: audit.refCode,
      razonSocial: audit.razonSocial,
      status: audit.status
    },
    cerrada,
    escaneos: escaneos.map((e) => ({
      id: e.id,
      etiqueta: e.etiqueta,
      rangoObjetivo: e.rango_objetivo,
      estado: e.estado,
      dispositivosDetectados: e.dispositivos_detectados,
      iniciadoAt: e.iniciado_at?.toISOString() ?? null,
      finalizadoAt: e.finalizado_at?.toISOString() ?? null,
      createdAt: e.created_at.toISOString(),
      tokenActivo: e.tokenActivo,
      tokenExpiresAt: e.tokenExpiresAt?.toISOString() ?? null
    })),
    dispositivos: consolidado.items.map((d) => ({
      identidad: d.identidad,
      identidadPorIp: d.identidadPorIp,
      mac: d.mac,
      ip: d.ip,
      hostname: d.hostname,
      fqdn: d.fqdn,
      fabricante: d.fabricante,
      modelo: d.modelo,
      serial: d.serial,
      tipo: d.tipo,
      soFamilia: d.soFamilia,
      soNombre: d.soNombre,
      soVersion: d.soVersion,
      cpuDescripcion: d.cpuDescripcion,
      memoriaMb: d.memoriaMb,
      discoTotalGb: d.discoTotalGb,
      vistoAt: d.vistoAt?.toISOString() ?? null,
      revision: d.revision,
      revisadoPor: d.revisadoPor,
      revisadoAt: d.revisadoAt?.toISOString() ?? null,
      notaTecnico: d.notaTecnico,
      relevamientoItemId: d.relevamientoItemId,
      relevamientoRowId: d.relevamientoRowId,
      canonicalId: d.canonicalId,
      ocurrencias: d.ocurrencias.map((o) => ({
        dispositivoId: o.dispositivoId,
        escaneoId: o.escaneoId,
        escaneoEtiqueta: o.escaneoEtiqueta,
        escaneoRango: o.escaneoRango,
        escaneoEstado: o.escaneoEstado,
        vistoAt: o.vistoAt?.toISOString() ?? null
      }))
    })),
    total: consolidado.total,
    contadores,
    filtros: {
      tipo: filtros.tipo ?? '',
      revision: filtros.revision ?? '',
      escaneo: filtros.escaneo ?? '',
      page: filtros.page
    },
    limit: LIMIT
  };
};

export const actions: Actions = {
  // R5: alta de escaneo en pendiente con el usuario de la sesión como técnico
  crearEscaneo: async ({ request, locals, params }) => {
    const user = requireStaff(locals);
    try {
      await assertAdminOrAssigned(params.id, user);
      const audit = await getAuditById(params.id, user);
      if (!audit) throw new ForbiddenError('Auditoría no encontrada');
      if (audit.status === 'cerrada') {
        return fail(409, {
          error: 'La auditoría está cerrada: no se pueden crear escaneos. Reabrirla para agregar datos.'
        });
      }
      const formData = await request.formData();
      const etiquetaRaw = String(formData.get('etiqueta') ?? '').trim();
      const input = parseCon(crearEscaneoUiInput, {
        etiqueta: etiquetaRaw === '' ? null : etiquetaRaw,
        rangoObjetivo: String(formData.get('rangoObjetivo') ?? '').trim()
      });
      const esc = await crearEscaneo(audit.clientId, user.id, {
        auditId: audit.id,
        etiqueta: input.etiqueta,
        rangoObjetivo: input.rangoObjetivo,
        agenteVersion: AGENTE_VERSION_INICIAL
      });
      return { success: true, escaneoId: esc.id };
    } catch (e) {
      return failFromEscaneoError(e);
    }
  },

  // R6: emite token y lo muestra en claro UNA vez en la respuesta del action
  emitirToken: async ({ request, locals, params }) => {
    const user = requireStaff(locals);
    try {
      await assertAdminOrAssigned(params.id, user);
      const audit = await getAuditById(params.id, user);
      if (!audit) throw new ForbiddenError('Auditoría no encontrada');
      if (audit.status === 'cerrada') {
        return fail(409, {
          error: 'La auditoría está cerrada: no se pueden emitir tokens.'
        });
      }
      const formData = await request.formData();
      const escaneoId = String(formData.get('escaneoId') ?? '');
      const ambito = await resolverAmbitoEscaneo(escaneoId);
      if (!ambito || ambito.auditId !== audit.id || ambito.empresaId !== audit.clientId) {
        return fail(404, { error: 'Escaneo no encontrado' });
      }
      const { token, expiresAt } = await emitirTokenEscaneo(escaneoId, user.id);
      return { success: true, token, expiresAt: expiresAt.toISOString(), escaneoId };
    } catch (e) {
      return failFromEscaneoError(e);
    }
  },

  // R7: revocación inmediata conservando el historial de emisión
  revocarToken: async ({ request, locals, params }) => {
    const user = requireStaff(locals);
    try {
      await assertAdminOrAssigned(params.id, user);
      const audit = await getAuditById(params.id, user);
      if (!audit) throw new ForbiddenError('Auditoría no encontrada');
      if (audit.status === 'cerrada') {
        return fail(409, {
          error: 'La auditoría está cerrada: no se pueden revocar tokens.'
        });
      }
      const formData = await request.formData();
      const escaneoId = String(formData.get('escaneoId') ?? '');
      const ambito = await resolverAmbitoEscaneo(escaneoId);
      if (!ambito || ambito.auditId !== audit.id || ambito.empresaId !== audit.clientId) {
        return fail(404, { error: 'Escaneo no encontrado' });
      }
      await revocarTokenEscaneo(escaneoId);
      return { success: true, escaneoId };
    } catch (e) {
      return failFromEscaneoError(e);
    }
  },

  // R20: acción rápida de lista (confirmar/descartar), sin nota. Permitida con
  // auditoría cerrada (R4, puerta 2026-08-30).
  marcar: async ({ request, locals, params }) => {
    const user = requireStaff(locals);
    try {
      await assertAdminOrAssigned(params.id, user);
      const audit = await getAuditById(params.id, user);
      if (!audit) throw new ForbiddenError('Auditoría no encontrada');
      const formData = await request.formData();
      const input = parseCon(marcarRevisionGrupoInput, {
        identidad: String(formData.get('identidad') ?? ''),
        revision: String(formData.get('revision') ?? '')
      });
      await marcarRevisionGrupo(audit.clientId, audit.id, input.identidad, input.revision, user.id);
      return { success: true, identidad: input.identidad, revision: input.revision };
    } catch (e) {
      return failFromEscaneoError(e);
    }
  }
};
