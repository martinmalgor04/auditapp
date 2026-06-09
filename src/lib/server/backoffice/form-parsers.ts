import type { CreateAuditInput } from './schemas';

export function parseCabResponses(formData: FormData): Record<string, unknown> {
  const cabResponses: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('cab_') && typeof value === 'string') {
      const itemId = key.slice(4);
      cabResponses[itemId] = value;
    }
  }
  return cabResponses;
}

export function parseTypesFromForm(formData: FormData): string[] {
  const types = formData.getAll('types').map(String).filter(Boolean);
  return types;
}

export function parseCreateAuditFromForm(formData: FormData): CreateAuditInput {
  const clientMode = String(formData.get('clientMode') ?? 'existing');
  const types = parseTypesFromForm(formData) as CreateAuditInput['types'];
  const cabResponses = parseCabResponses(formData);

  const base = {
    types,
    segment: String(formData.get('segment')) as CreateAuditInput['segment'],
    assignedTechId: String(formData.get('assignedTechId')),
    scheduledAt: String(formData.get('scheduledAt')),
    cabResponses
  };

  if (clientMode === 'new') {
    return {
      ...base,
      newClient: {
        razonSocial: String(formData.get('newRazonSocial') ?? ''),
        cuit: String(formData.get('newCuit') ?? ''),
        rubro: String(formData.get('newRubro') ?? '')
      }
    };
  }

  return {
    ...base,
    clientId: String(formData.get('clientId') ?? '')
  };
}
