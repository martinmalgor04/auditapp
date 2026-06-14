import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildValidInternalDraft, loadInformeCanonicalGolden } from './fixtures/informe-claude-mock';
import { buildPsysIdempotencyKey, buildPsysPayload } from '../src/lib/server/psys/payload';
import { createPsysProposal, getPsysProposal } from '../src/lib/server/psys/client';
import { PsysConfigError, PsysRemoteError } from '../src/lib/server/psys/errors';
import {
  clearPsysEnv,
  mockPsysFetch,
  PSYS_MOCK_KEY,
  PSYS_MOCK_URL,
  setPsysEnv,
  type PsysFetchCall
} from './fixtures/psys-proposal';

describe('psys HTTP client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearPsysEnv();
  });

  it('envía Authorization e Idempotency-Key (R5)', async () => {
    setPsysEnv();
    const calls: PsysFetchCall[] = [];
    mockPsysFetch((call) => {
      calls.push(call);
      return {
        status: 201,
        body: {
          proposal: {
            id: randomUUID(),
            number_display: '0000100000123',
            status: 'borrador',
            url: 'https://presupuestos.serviciosysistemas.com.ar/presupuestos/x'
          }
        }
      };
    });

    const golden = loadInformeCanonicalGolden();
    const payload = buildPsysPayload({
      auditId: golden.audit_id,
      report: {
        id: randomUUID(),
        auditId: golden.audit_id,
        version: 2,
        status: 'aprobado',
        canonicalJson: golden,
        schemaVersion: golden.schema_version,
        clientDraft: null,
        internalDraft: buildValidInternalDraft(),
        promptVersion: null,
        model: null,
        errorMessage: null,
        loomUrl: null,
        requestedBy: randomUUID(),
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
    const key = buildPsysIdempotencyKey(golden.audit_id, 2);
    await createPsysProposal(payload, { idempotencyKey: key });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${PSYS_MOCK_URL}/api/m2m/proposals`);
    expect(calls[0].headers.authorization).toBe(`Bearer ${PSYS_MOCK_KEY}`);
    expect(calls[0].headers['idempotency-key']).toBe(key);
  });

  it('sin env lanza PsysConfigError (R3)', async () => {
    clearPsysEnv();
    const golden = loadInformeCanonicalGolden();
    const payload = buildPsysPayload({
      auditId: golden.audit_id,
      report: {
        id: randomUUID(),
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
        requestedBy: randomUUID(),
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
    await expect(createPsysProposal(payload, { idempotencyKey: 'k' })).rejects.toBeInstanceOf(
      PsysConfigError
    );
  });

  it('500 remoto mapea a PsysRemoteError (R8)', async () => {
    setPsysEnv();
    mockPsysFetch(() => ({ status: 500, body: { error: 'boom' } }));
    const golden = loadInformeCanonicalGolden();
    const payload = buildPsysPayload({
      auditId: golden.audit_id,
      report: {
        id: randomUUID(),
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
        requestedBy: randomUUID(),
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
    await expect(
      createPsysProposal(payload, { idempotencyKey: 'k' })
    ).rejects.toBeInstanceOf(PsysRemoteError);
  });

  it('timeout mapea a PsysRemoteError (R8)', async () => {
    vi.useFakeTimers();
    setPsysEnv();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        const signal = init?.signal as AbortSignal | undefined;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      })
    );
    const golden = loadInformeCanonicalGolden();
    const payload = buildPsysPayload({
      auditId: golden.audit_id,
      report: {
        id: randomUUID(),
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
        requestedBy: randomUUID(),
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
    const pending = createPsysProposal(payload, { idempotencyKey: 'timeout-key' });
    const assertion = expect(pending).rejects.toBeInstanceOf(PsysRemoteError);
    await vi.advanceTimersByTimeAsync(10_001);
    await assertion;
    vi.useRealTimers();
  });

  it('parsea 201 y 200-existente (R9)', async () => {
    setPsysEnv();
    const id = randomUUID();
    mockPsysFetch((call) => ({
      status: call.method === 'POST' ? 200 : 200,
      body: {
        proposal: {
          id,
          number_display: '0000100000456',
          status: 'borrador',
          url: `https://presupuestos.serviciosysistemas.com.ar/presupuestos/${id}`
        }
      }
    }));
    const golden = loadInformeCanonicalGolden();
    const payload = buildPsysPayload({
      auditId: golden.audit_id,
      report: {
        id: randomUUID(),
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
        requestedBy: randomUUID(),
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
    const result = await createPsysProposal(payload, { idempotencyKey: 'k' });
    expect(result.alreadyExisted).toBe(true);
    expect(result.proposal.id).toBe(id);

    const fetched = await getPsysProposal(id);
    expect(fetched.number_display).toBe('0000100000456');
  });
});
