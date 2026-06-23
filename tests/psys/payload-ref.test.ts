import { describe, expect, it } from 'vitest';
import { buildPsysPayload } from '../../src/lib/server/psys/payload';
import { PSYS_CONTRACT_VERSION, psysProposalPayloadSchema } from '../../src/lib/server/psys/schemas';
import { buildValidInternalDraft, loadInformeCanonicalGolden } from '../fixtures/informe-claude-mock';

describe('psys payload ref_code (#41 R19)', () => {
  const golden = loadInformeCanonicalGolden();

  it('contract v1.1 incluye source.ref_code obligatorio', () => {
    expect(PSYS_CONTRACT_VERSION).toBe('1.1');
    const payload = buildPsysPayload({
      auditId: golden.audit_id,
      refCode: 'ISX-ERP-0002',
      report: {
        id: '00000000-0000-4000-8000-000000000001',
        auditId: golden.audit_id,
        version: 1,
        status: 'aprobado',
        canonicalJson: golden,
        schemaVersion: golden.schema_version,
        clientDraft: null,
        internalDraft: buildValidInternalDraft(),
        promptVersion: null,
        model: null,
        errorMessage: null,
        loomUrl: null,
        requestedBy: '00000000-0000-4000-8000-000000000099',
        editedBy: null,
        editedAt: null,
        approvedBy: null,
        approvedAt: new Date(),
        ejemplar: false,
        contextMeta: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      canonical: golden
    });
    expect(payload.source.ref_code).toBe('ISX-ERP-0002');
    expect(psysProposalPayloadSchema.safeParse(payload).success).toBe(true);
  });
});
