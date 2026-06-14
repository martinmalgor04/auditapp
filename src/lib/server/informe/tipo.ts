import type { CanonicalAudit, CanonicalSection } from '$lib/server/canonical/schema';
import { TEMPLATE_CODE_TO_INDEX } from '$lib/server/scoring/constants';
import { InformeDomainUnresolvedError } from './errors';

export type TipoAuditoria = 'erp' | 'it' | 'mixta';

export function tipoAuditoria(types: string[]): TipoAuditoria {
  const hasErp = types.some((t) => t.startsWith('erp'));
  const hasIt = types.includes('it');
  if (hasErp && hasIt) return 'mixta';
  if (hasIt) return 'it';
  return 'erp';
}

export function resolveSectionDomain(
  section: Pick<CanonicalSection, 'code' | 'template_code'>,
  auditTipo: TipoAuditoria
): 'it' | 'erp' {
  if (section.template_code) {
    const domain = TEMPLATE_CODE_TO_INDEX[section.template_code];
    if (!domain) {
      throw new InformeDomainUnresolvedError(
        `template_code desconocido: ${section.template_code} (sección ${section.code})`
      );
    }
    return domain;
  }
  if (auditTipo === 'mixta') {
    throw new InformeDomainUnresolvedError(
      `No se pudo determinar el dominio de la sección ${section.code} en auditoría mixta (falta template_code)`
    );
  }
  return auditTipo === 'it' ? 'it' : 'erp';
}

/** Valida que todas las secciones tengan dominio resoluble (R6). */
export function assertSectionDomainsResolvable(canonical: CanonicalAudit): void {
  const tipo = tipoAuditoria(canonical.types);
  for (const section of canonical.sections) {
    resolveSectionDomain(section, tipo);
  }
}
