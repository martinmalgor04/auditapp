/** Errores tipados del export/import de bundles de auditoría (#20). */

/** Bundle inválido contra Zod → HTTP 400. */
export class AuditBundleValidationError extends Error {
  readonly code = 'AUDIT_BUNDLE_VALIDATION';

  constructor(
    message = 'Bundle inválido',
    /** Detalle legible de los problemas de validación (sin stack traces). */
    public readonly issues: string[] = []
  ) {
    super(message);
    this.name = 'AuditBundleValidationError';
  }
}

/** Faltan entidades obligatorias en destino (template/sección/ítem) → HTTP 422. */
export class AuditBundleResolutionError extends Error {
  readonly code = 'AUDIT_BUNDLE_RESOLUTION';

  constructor(public readonly missing: string[]) {
    super('Entidades faltantes en destino');
    this.name = 'AuditBundleResolutionError';
  }
}

/**
 * El bundle ya fue importado antes (dedupe por `{origin_instance_id, origin_audit_id}`).
 * No se usa para fallar: el import reporta `duplicate: true`; se expone por completitud.
 */
export class AuditBundleDuplicateError extends Error {
  readonly code = 'AUDIT_BUNDLE_DUPLICATE';

  constructor(public readonly auditId: string) {
    super('El bundle ya fue importado');
    this.name = 'AuditBundleDuplicateError';
  }
}
