import { PSYS_PROPOSAL_STATUSES, type PsysProposalStatus } from '$lib/server/psys/schemas';

const STATUS_LABELS: Record<PsysProposalStatus, string> = {
  borrador: 'Borrador',
  'borrador-importado': 'Borrador importado',
  revision: 'En revisión',
  enviado: 'Enviado',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  archivado: 'Archivado'
};

export function translatePsysStatus(status: string | null | undefined): string {
  if (!status) return 'Sin estado';
  if ((PSYS_PROPOSAL_STATUSES as readonly string[]).includes(status)) {
    return STATUS_LABELS[status as PsysProposalStatus];
  }
  return status;
}

export function canShowCreateProposal(args: {
  isAdmin: boolean;
  hasApprovedReport: boolean;
  hasActiveLink: boolean;
}): boolean {
  return args.isAdmin && args.hasApprovedReport && !args.hasActiveLink;
}

export function canShowSyncProposal(args: {
  isAdmin: boolean;
  hasActiveLink: boolean;
}): boolean {
  return args.isAdmin && args.hasActiveLink;
}
