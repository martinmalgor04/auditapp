export type R2KeyInput =
  | { auditId: string; sectionCode: string; uuid?: string }
  | { auditId: string; general: true; uuid?: string };

const SECTION_CODE_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Normaliza section_code: alfanumérico + guión, sin path traversal. */
export function sanitizeSectionCode(code: string): string {
  const trimmed = code.trim();
  if (!trimmed || !SECTION_CODE_PATTERN.test(trimmed) || trimmed.includes('..')) {
    throw new Error('section_code inválido');
  }
  return trimmed;
}

/** Genera key según convención; uuid default crypto.randomUUID(). */
export function buildR2Key(input: R2KeyInput): string {
  const uuid = input.uuid ?? crypto.randomUUID();

  if ('general' in input && input.general === true) {
    return `audits/${input.auditId}/_general/${uuid}`;
  }

  if ('sectionCode' in input) {
    const section = sanitizeSectionCode(input.sectionCode);
    return `audits/${input.auditId}/${section}/${uuid}`;
  }

  throw new Error('R2KeyInput inválido');
}

/** Valida que una key pertenezca a la auditoría indicada. */
export function isR2KeyForAudit(r2Key: string, auditId: string): boolean {
  return r2Key.startsWith(`audits/${auditId}/`);
}

/** Genera key R2 para grabación de reunión: audits/{auditId}/_reunion/{uuid}.{ext} */
export function buildReunionR2Key(
  auditId: string,
  ext: 'webm' | 'm4a' | 'mp3',
  uuid?: string
): string {
  const id = uuid ?? crypto.randomUUID();
  return `audits/${auditId}/_reunion/${id}.${ext}`;
}
