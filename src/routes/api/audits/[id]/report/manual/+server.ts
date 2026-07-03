import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { apiError, apiSuccess } from '$lib/server/api/envelope';
import { requireSessionApi } from '$lib/server/api/guards';
import { getAuditForReport } from '$lib/server/informe/access';
import { insertManualReport, getReportByAuditVersion } from '$lib/server/db/informe-reports';
import { listAuditAssignments } from '$lib/server/db/audit-assignment';

const MAX_INFORME_MANUAL_HTML_BYTES = 5 * 1024 * 1024; // 5 MiB (R12)

const ManualHtmlSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size > 0, 'El archivo no puede estar vacío')
    .refine((f) => f.size <= MAX_INFORME_MANUAL_HTML_BYTES, `El archivo supera el límite de 5 MiB`)
    .refine((f) => f.type === 'text/html' || f.type === '', 'El archivo debe ser HTML')
});

type ManualHtmlInput = z.infer<typeof ManualHtmlSchema>;

/** POST /api/audits/[id]/report/manual — Subida de HTML manual (R9–R14). */
export const POST: RequestHandler = async ({ params, locals, request }) => {
  // R10: validar sesión
  const userOrResponse = requireSessionApi(locals);
  if (userOrResponse instanceof Response) {
    return userOrResponse;
  }
  const user = userOrResponse;

  const auditId = params.id!;
  const audit = await getAuditForReport(auditId);
  if (!audit) {
    return apiError('Auditoría no encontrada', 404);
  }

  // R11: permisos (admin o técnico asignado por líder o assignment)
  if (user.role !== 'admin') {
    const isAssigned =
      audit.assignedTechId === user.id ||
      (await listAuditAssignments(auditId)).some((a) => a.techId === user.id);
    if (!isAssigned) {
      return apiError('No tienes permiso para subir informes', 403);
    }
  }

  // Parsear FormData
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return apiError('FormData inválido', 400);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return apiError('Campo "file" requerido como archivo', 400);
  }

  // Validar según R12 (tamaño)
  if (file.size === 0) {
    return apiError('El archivo no puede estar vacío', 400);
  }
  if (file.size > MAX_INFORME_MANUAL_HTML_BYTES) {
    return apiError(`El archivo supera el límite de 5 MiB`, 400);
  }

  // Leer contenido
  let htmlContent: string;
  try {
    htmlContent = await file.text();
  } catch {
    return apiError('Error leyendo archivo', 400);
  }

  // R13: validar que contiene </body>
  if (!htmlContent.toLowerCase().includes('</body>')) {
    return apiError('El HTML no contiene etiqueta </body> requerida', 400);
  }

  // R7: validar que existe versión previa
  const previousReport = await getReportByAuditVersion(auditId, 1);
  if (!previousReport) {
    return apiError('La auditoría debe tener al menos una versión de informe previa', 409);
  }

  // Insertar versión manual (R4, R5, R6)
  try {
    const newReport = await insertManualReport({
      auditId,
      htmlManual: htmlContent,
      uploadedBy: user.id
    });

    if (!newReport) {
      return apiError('Error creando versión manual', 500);
    }

    return apiSuccess({
      id: newReport.id,
      version: newReport.version
    });
  } catch (err) {
    console.error('[manual-upload]', err);
    return apiError(`Error al guardar informe: ${err instanceof Error ? err.message : 'desconocido'}`, 500);
  }
};
