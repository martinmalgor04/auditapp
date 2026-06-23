import type postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { insertActiveProposalLink } from '../../src/lib/server/db/psys-links';
import { PSYS_CONTRACT_VERSION } from '../../src/lib/server/psys/schemas';
import { buildPsysPayload } from '../../src/lib/server/psys/payload';
import { seedReportForShare } from './informe-share';
import { buildValidInternalDraft, loadInformeCanonicalGolden } from './informe-claude-mock';

export const PSYS_MOCK_URL = 'https://psys.test';
export const PSYS_MOCK_KEY = 'test-psys-key';

export function setPsysEnv(): void {
  process.env.PSYS_API_URL = PSYS_MOCK_URL;
  process.env.PSYS_API_KEY = PSYS_MOCK_KEY;
}

export function clearPsysEnv(): void {
  delete process.env.PSYS_API_URL;
  delete process.env.PSYS_API_KEY;
}

export type PsysFetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
};

export function mockPsysFetch(
  handler: (call: PsysFetchCall) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>
): void {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    let body: unknown;
    if (init?.body && typeof init.body === 'string') {
      body = JSON.parse(init.body);
    }
    const result = await handler({ url, method: init?.method ?? 'GET', headers, body });
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' }
    });
  });
}

export function defaultCreateHandler(proposalId = randomUUID()) {
  return (call: PsysFetchCall) => {
    if (call.method === 'POST' && call.url.endsWith('/api/m2m/proposals')) {
      return {
        status: 201,
        body: {
          proposal: {
            id: proposalId,
            number_display: '0000100000123',
            status: 'borrador',
            url: `https://presupuestos.serviciosysistemas.com.ar/presupuestos/${proposalId}`
          }
        }
      };
    }
    return { status: 404, body: { error: 'not found' } };
  };
}

export async function seedApprovedReportFixture(sql: postgres.Sql) {
  return seedReportForShare(sql, 'aprobado');
}

export async function seedActiveProposalLink(
  sql: postgres.Sql,
  fixture: Awaited<ReturnType<typeof seedApprovedReportFixture>>,
  proposalId = randomUUID()
) {
  const report = await sql<{ id: string; version: number; canonical_json: unknown; internal_draft: unknown }[]>`
    SELECT id, version, canonical_json, internal_draft
    FROM audit_report WHERE id = ${fixture.reportId}
  `;
  const row = report[0];
  const golden = loadInformeCanonicalGolden();
  const payload = buildPsysPayload({
    auditId: fixture.auditId,
    refCode: 'TEST-IT-0001',
    report: {
      id: row.id,
      auditId: fixture.auditId,
      version: row.version,
      status: 'aprobado',
      canonicalJson: golden,
      schemaVersion: golden.schema_version,
      clientDraft: null,
      internalDraft: buildValidInternalDraft(),
      promptVersion: null,
      model: null,
      errorMessage: null,
      loomUrl: null,
      requestedBy: fixture.admin.id,
      editedBy: null,
      editedAt: null,
      approvedBy: fixture.admin.id,
      approvedAt: new Date(),
      ejemplar: false,
      contextMeta: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    canonical: golden
  });

  return insertActiveProposalLink({
    auditId: fixture.auditId,
    reportId: fixture.reportId,
    proposalId,
    numberDisplay: '0000100000999',
    proposalUrl: `https://presupuestos.serviciosysistemas.com.ar/presupuestos/${proposalId}`,
    psysStatus: 'borrador',
    contractVersion: PSYS_CONTRACT_VERSION,
    sentPayload: payload,
    createdBy: fixture.admin.id
  });
}
