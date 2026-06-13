import { describe, expect, it } from 'vitest';
import { buildValidInternalDraft, loadInformeCanonicalGolden } from './fixtures/informe-claude-mock';
import { buildPsysPayload } from '../src/lib/server/psys/payload';
import {
  PSYS_CONTRACT_VERSION,
  psysProposalPayloadSchema
} from '../src/lib/server/psys/schemas';

describe('psys payload contract', () => {
  const golden = loadInformeCanonicalGolden();

  it('PSYS_CONTRACT_VERSION vale 1.0 y aparece en payloads generados (R15)', () => {
    expect(PSYS_CONTRACT_VERSION).toBe('1.0');
    const payload = buildPsysPayload({
      auditId: golden.audit_id,
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
        createdAt: new Date(),
        updatedAt: new Date()
      },
      canonical: golden
    });
    expect(payload.contract_version).toBe('1.0');
    expect(psysProposalPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it('rechaza payload sin linea o sin contract_version (R4)', () => {
    const valid = buildPsysPayload({
      auditId: golden.audit_id,
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
        createdAt: new Date(),
        updatedAt: new Date()
      },
      canonical: golden
    });

    const noLinea = structuredClone(valid);
    noLinea.internal_notes.recomendaciones_presupuesto[0].linea = '';
    expect(psysProposalPayloadSchema.safeParse(noLinea).success).toBe(false);

    const badVersion = structuredClone(valid);
    // @ts-expect-error contract test
    badVersion.contract_version = '9.9';
    expect(psysProposalPayloadSchema.safeParse(badVersion).success).toBe(false);
  });

  it('recomendaciones y upsell solo bajo internal_notes, no en inputs (R14)', () => {
    const payload = buildPsysPayload({
      auditId: golden.audit_id,
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
        createdAt: new Date(),
        updatedAt: new Date()
      },
      canonical: golden
    });

    expect(payload).not.toHaveProperty('inputs');
    expect(payload.internal_notes.recomendaciones_presupuesto.length).toBeGreaterThan(0);
    expect(payload.internal_notes.upsell_findings.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/"inputs"/);
    expect(serialized).toContain('internal_notes');
  });
});
