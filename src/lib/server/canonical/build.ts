import { getSql } from '$lib/server/db/client';
import { logger } from '$lib/server/logger';
import type { FieldType } from '$lib/server/db/field-schemas';
import { AuditNotFoundError } from '$lib/server/backoffice/errors';
import type { TopRisk } from '$lib/server/scoring/types';
import { CanonicalBuildError } from './errors';
import { extractMarketData } from './market-data';
import {
  canonicalAuditSchema,
  type CanonicalAudit,
  type CanonicalItem,
  type CanonicalSection
} from './schema';
import { CANONICAL_SCHEMA_VERSION } from './version';

type ScoreBreakdownEntry = {
  itemId: string;
  points: 0 | 50 | 100 | null;
};

function formatIsoWithOffset(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const oh = pad(Math.floor(abs / 60));
  const om = pad(abs % 60);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${oh}:${om}`;
}

function breakdownToMap(breakdown: unknown): Map<string, number> {
  const map = new Map<string, number>();
  if (!Array.isArray(breakdown)) return map;
  for (const entry of breakdown as ScoreBreakdownEntry[]) {
    if (entry?.itemId && typeof entry.points === 'number') {
      map.set(entry.itemId, entry.points);
    }
  }
  return map;
}

export type BuildCanonicalOptions = {
  /** Si false, exige status cerrada (export). Default true para preview/cierre. */
  allowOpen?: boolean;
};

export async function buildCanonicalAuditJson(
  auditId: string,
  options: BuildCanonicalOptions = {}
): Promise<CanonicalAudit> {
  const { allowOpen = true } = options;
  const sql = getSql();

  const [audit] = await sql<
    {
      id: string;
      status: string;
      types: string[];
      segment: string;
      template_ids: string[];
      closed_at: Date | null;
      razon_social: string;
      cuit: string | null;
      rubro: string | null;
      erp_actual: string | null;
      empleados: number | null;
      puestos: number | null;
      sedes: number | null;
      proveedor_correo: string | null;
      soporte_it_actual: string | null;
    }[]
  >`
    SELECT
      a.id, a.status, a.types, a.segment, a.template_ids, a.closed_at,
      c.razon_social, c.cuit, c.rubro,
      c.erp_actual, c.empleados, c.puestos, c.sedes,
      c.proveedor_correo, c.soporte_it_actual
    FROM audit a
    JOIN client c ON c.id = a.client_id
    WHERE a.id = ${auditId}
      AND a.archived_at IS NULL
    LIMIT 1
  `;

  if (!audit) {
    throw new AuditNotFoundError();
  }

  if (!allowOpen && audit.status !== 'cerrada') {
    const { AuditNotClosedError } = await import('./errors');
    throw new AuditNotClosedError();
  }

  const templateRows = await sql<{ code: string; version: string }[]>`
    SELECT code, version
    FROM template
    WHERE id = ANY(${audit.template_ids}::uuid[])
    ORDER BY code
  `;

  const sectionRows = await sql<
    {
      id: string;
      code: string;
      title: string;
      standard_ref: string | null;
      weight: CanonicalSection['weight'];
      has_score: boolean;
      sort_order: number;
      template_code: string;
    }[]
  >`
    SELECT s.id, s.code, s.title, s.standard_ref, s.weight, s.has_score, s.sort_order, t.code AS template_code
    FROM section s
    JOIN template t ON t.id = s.template_id
    WHERE s.template_id = ANY(${audit.template_ids}::uuid[])
      AND s.code != 'CAB'
    ORDER BY s.sort_order, s.code
  `;

  const itemRows = await sql<
    {
      id: string;
      section_id: string;
      label: string;
      field_type: FieldType;
      scores: boolean;
      sort_order: number;
    }[]
  >`
    SELECT ti.id, ti.section_id, ti.label, ti.field_type, ti.scores, ti.sort_order
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE s.template_id = ANY(${audit.template_ids}::uuid[])
      AND s.code != 'CAB'
    ORDER BY ti.sort_order
  `;

  const responseRows = await sql<
    {
      item_id: string;
      value: unknown;
      na: boolean;
      observations: string | null;
    }[]
  >`
    SELECT item_id, value, na, observations
    FROM audit_response
    WHERE audit_id = ${auditId}
  `;

  const responseMap = new Map(responseRows.map((r) => [r.item_id, r]));

  const scoreRows = await sql<
    {
      section_id: string;
      score: number | null;
      score_breakdown: unknown;
      observations: string | null;
    }[]
  >`
    SELECT section_id, score, score_breakdown, observations
    FROM audit_section_score
    WHERE audit_id = ${auditId}
  `;

  const scoreBySection = new Map(scoreRows.map((s) => [s.section_id, s]));

  const attachmentRows = await sql<{ item_id: string; r2_key: string }[]>`
    SELECT item_id, r2_key
    FROM attachment
    WHERE audit_id = ${auditId}
      AND item_id IS NOT NULL
    ORDER BY created_at
  `;

  const attachmentsByItem = new Map<string, string[]>();
  for (const row of attachmentRows) {
    const list = attachmentsByItem.get(row.item_id) ?? [];
    list.push(row.r2_key);
    attachmentsByItem.set(row.item_id, list);
  }

  const [modulosRow] = await sql<{ value: unknown }[]>`
    SELECT ar.value
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    LEFT JOIN audit_response ar ON ar.audit_id = ${auditId} AND ar.item_id = ti.id
    WHERE s.template_id = ANY(${audit.template_ids}::uuid[])
      AND s.code = 'CAB'
      AND ti.options->>'item_code' = 'cab_modulos_tango'
    LIMIT 1
  `;

  const [closure] = await sql<
    {
      indice_it: number | null;
      indice_erp: number | null;
      top_risks: TopRisk[];
      quick_wins: string[];
      upsell_findings: string[];
      next_step: string | null;
    }[]
  >`
    SELECT indice_it, indice_erp, top_risks, quick_wins, upsell_findings, next_step
    FROM audit_closure
    WHERE audit_id = ${auditId}
  `;

  const itemsBySection = new Map<string, (typeof itemRows)[number][]>();
  for (const item of itemRows) {
    const list = itemsBySection.get(item.section_id) ?? [];
    list.push(item);
    itemsBySection.set(item.section_id, list);
  }

  const sections: CanonicalSection[] = sectionRows.map((section) => {
    const scoreRow = scoreBySection.get(section.id);
    const breakdownMap = breakdownToMap(scoreRow?.score_breakdown);

    const items: CanonicalItem[] = (itemsBySection.get(section.id) ?? []).map((item) => {
      const response = responseMap.get(item.id);
      const canonicalItem: CanonicalItem = {
        item_id: item.id,
        label: item.label,
        field_type: item.field_type,
        value: response?.value ?? null,
        na: response?.na ?? false,
        observations: response?.observations ?? null,
        attachments: attachmentsByItem.get(item.id) ?? []
      };

      if (item.scores && !canonicalItem.na) {
        const contribution = breakdownMap.get(item.id);
        if (contribution !== undefined) {
          canonicalItem.score_contribution = contribution;
        }
      }

      return canonicalItem;
    });

    const sectionPayload: CanonicalSection = {
      code: section.code,
      title: section.title,
      standard_ref: section.standard_ref,
      weight: section.weight,
      score: scoreRow?.score ?? null,
      template_code: section.template_code,
      observations: scoreRow?.observations ?? null,
      items
    };

    if (section.has_score && sectionPayload.score !== null) {
      sectionPayload.score_basis = 'auto';
    }

    return sectionPayload;
  });

  const indices: CanonicalAudit['indices'] = {} as CanonicalAudit['indices'];
  if (audit.types.includes('it') && closure?.indice_it != null) {
    indices.it = closure.indice_it;
  }
  if (
    (audit.types.includes('erp-tango') || audit.types.includes('erp-estandar')) &&
    closure?.indice_erp != null
  ) {
    indices.erp = closure.indice_erp;
  }

  if (indices.it === undefined && indices.erp === undefined) {
    if (closure?.indice_it != null) indices.it = closure.indice_it;
    if (closure?.indice_erp != null) indices.erp = closure.indice_erp;
  }

  const market_data = extractMarketData(
    {
      erp_actual: audit.erp_actual,
      empleados: audit.empleados,
      puestos: audit.puestos,
      sedes: audit.sedes,
      proveedor_correo: audit.proveedor_correo,
      soporte_it_actual: audit.soporte_it_actual
    },
    modulosRow?.value
  );

  const upsellRaw = closure?.upsell_findings ?? [];
  const upsell_findings = upsellRaw.map((text) => ({
    text: typeof text === 'string' ? text : String(text),
    internal: true as const
  }));

  const payload: CanonicalAudit = {
    schema_version: CANONICAL_SCHEMA_VERSION,
    audit_id: audit.id,
    generated_at: formatIsoWithOffset(new Date()),
    client: {
      razon_social: audit.razon_social,
      cuit: audit.cuit,
      rubro: audit.rubro,
      segment: audit.segment as 'A' | 'B' | 'C'
    },
    types: audit.types,
    templates: templateRows.map((t) => ({ code: t.code, version: t.version })),
    sections,
    indices,
    top_risks: closure?.top_risks ?? [],
    quick_wins: closure?.quick_wins ?? [],
    upsell_findings,
    next_step: closure?.next_step ?? null,
    market_data,
    closed_at: audit.closed_at ? formatIsoWithOffset(audit.closed_at) : null
  };

  try {
    return canonicalAuditSchema.parse(payload);
  } catch (err) {
    logger.error('canonical_schema_validation_failed', { auditId }, err);
    throw new CanonicalBuildError();
  }
}
