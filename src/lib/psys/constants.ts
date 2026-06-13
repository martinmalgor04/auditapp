export const PSYS_PROPOSAL_STATUSES = [
  'borrador',
  'borrador-importado',
  'revision',
  'enviado',
  'aceptado',
  'rechazado',
  'archivado'
] as const;

export type PsysProposalStatus = (typeof PSYS_PROPOSAL_STATUSES)[number];

export function isKnownPsysStatus(status: string): status is PsysProposalStatus {
  return (PSYS_PROPOSAL_STATUSES as readonly string[]).includes(status);
}
