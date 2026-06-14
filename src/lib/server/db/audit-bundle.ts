import type { Sql } from 'postgres';
import { getSql } from './client';
import { itemKeyString, resolveItemKey } from '$lib/server/bundle/item-key';
import type { ClientRef, ItemKey, TemplateRef } from '$lib/server/bundle/schema';

/** Cabecera de la auditoría con todas las claves naturales resueltas (para el build). */
export type AuditBundleRow = {
  id: string;
  name: string;
  types: string[];
  template_ids: string[];
  segment: 'A' | 'B' | 'C';
  status: string;
  scheduled_at: Date | null;
  closed_at: Date | null;
  // cliente (clave natural)
  client_cuit: string | null;
  client_razon_social: string;
  client_rubro: string | null;
  client_provincia: string | null;
  // usuarios (clave natural)
  assigned_tech_email: string | null;
  created_by_email: string | null;
  // templates del header
  templates: TemplateRef[];
};

export type ResponseWithKey = {
  item_key: ItemKey;
  value: unknown;
  na: boolean;
  observations: string | null;
  source: 'admin' | 'cliente' | 'tecnico';
  updated_by_email: string | null;
};

export type ScoreWithCode = {
  template: TemplateRef;
  section_code: string;
  score: number | null;
  score_breakdown: unknown;
  observations: string | null;
};

export type ClosureRow = {
  indice_it: number | null;
  indice_erp: number | null;
  top_risks: unknown;
  quick_wins: unknown;
  upsell_findings: unknown;
  next_step: string | null;
  closed_by_email: string | null;
  closed_at: Date | null;
};

export type AttachmentWithKey = {
  origin_id: string;
  r2_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  kind: 'photo' | 'export';
  item_key: ItemKey | null;
  uploaded_by_email: string | null;
};

// ── Lecturas para el build (export) ────────────────────────────────────────

export async function loadAuditForBundle(auditId: string): Promise<AuditBundleRow | null> {
  const sql = getSql();
  const [row] = await sql<
    {
      id: string;
      name: string;
      types: string[];
      template_ids: string[];
      segment: 'A' | 'B' | 'C';
      status: string;
      scheduled_at: Date | null;
      closed_at: Date | null;
      client_cuit: string | null;
      client_razon_social: string;
      client_rubro: string | null;
      client_provincia: string | null;
      assigned_tech_email: string | null;
      created_by_email: string | null;
    }[]
  >`
    SELECT
      a.id, a.name, a.types, a.template_ids, a.segment, a.status,
      a.scheduled_at, a.closed_at,
      c.cuit AS client_cuit,
      c.razon_social AS client_razon_social,
      c.rubro AS client_rubro,
      c.provincia AS client_provincia,
      tech.email AS assigned_tech_email,
      creator.email AS created_by_email
    FROM audit a
    JOIN client c ON c.id = a.client_id
    LEFT JOIN app_user tech ON tech.id = a.assigned_tech_id
    LEFT JOIN app_user creator ON creator.id = a.created_by
    WHERE a.id = ${auditId}
    LIMIT 1
  `;

  if (!row) {
    return null;
  }

  const templates = await sql<{ code: string; version: string }[]>`
    SELECT code, version
    FROM template
    WHERE id = ANY(${row.template_ids}::uuid[])
    ORDER BY code
  `;

  return { ...row, templates: templates.map((t) => ({ code: t.code, version: t.version })) };
}

export async function loadResponsesWithItemKeys(auditId: string): Promise<ResponseWithKey[]> {
  const sql = getSql();
  const rows = await sql<
    {
      section_code: string;
      field_type: string;
      sort_order: number;
      label: string;
      value: unknown;
      na: boolean;
      observations: string | null;
      source: 'admin' | 'cliente' | 'tecnico';
      updated_by_email: string | null;
    }[]
  >`
    SELECT
      s.code AS section_code,
      ti.field_type, ti.sort_order, ti.label,
      ar.value, ar.na, ar.observations, ar.source,
      u.email AS updated_by_email
    FROM audit_response ar
    JOIN template_item ti ON ti.id = ar.item_id
    JOIN section s ON s.id = ti.section_id
    LEFT JOIN app_user u ON u.id = ar.updated_by
    WHERE ar.audit_id = ${auditId}
    ORDER BY s.code, ti.sort_order
  `;

  return rows.map((r) => ({
    item_key: resolveItemKey(r),
    value: r.value,
    na: r.na,
    observations: r.observations,
    source: r.source,
    updated_by_email: r.updated_by_email
  }));
}

export async function loadSectionScoresWithCodes(auditId: string): Promise<ScoreWithCode[]> {
  const sql = getSql();
  const rows = await sql<
    {
      section_code: string;
      template_code: string;
      template_version: string;
      score: number | null;
      score_breakdown: unknown;
      observations: string | null;
    }[]
  >`
    SELECT
      s.code AS section_code,
      t.code AS template_code,
      t.version AS template_version,
      ass.score, ass.score_breakdown, ass.observations
    FROM audit_section_score ass
    JOIN section s ON s.id = ass.section_id
    JOIN template t ON t.id = s.template_id
    WHERE ass.audit_id = ${auditId}
    ORDER BY t.code, s.code
  `;

  return rows.map((r) => ({
    template: { code: r.template_code, version: r.template_version },
    section_code: r.section_code,
    score: r.score,
    score_breakdown: r.score_breakdown,
    observations: r.observations
  }));
}

export async function loadClosure(auditId: string): Promise<ClosureRow | null> {
  const sql = getSql();
  const [row] = await sql<
    {
      indice_it: number | null;
      indice_erp: number | null;
      top_risks: unknown;
      quick_wins: unknown;
      upsell_findings: unknown;
      next_step: string | null;
      closed_by_email: string | null;
      closed_at: Date | null;
    }[]
  >`
    SELECT
      ac.indice_it, ac.indice_erp, ac.top_risks, ac.quick_wins,
      ac.upsell_findings, ac.next_step, ac.closed_at,
      u.email AS closed_by_email
    FROM audit_closure ac
    LEFT JOIN app_user u ON u.id = ac.closed_by
    WHERE ac.audit_id = ${auditId}
    LIMIT 1
  `;
  return row ?? null;
}

export async function loadAttachmentsWithItemKeys(auditId: string): Promise<AttachmentWithKey[]> {
  const sql = getSql();
  const rows = await sql<
    {
      origin_id: string;
      r2_key: string;
      filename: string;
      content_type: string;
      size_bytes: string;
      kind: 'photo' | 'export';
      section_code: string | null;
      field_type: string | null;
      sort_order: number | null;
      label: string | null;
      uploaded_by_email: string | null;
    }[]
  >`
    SELECT
      at.id AS origin_id, at.r2_key, at.filename, at.content_type,
      at.size_bytes::text AS size_bytes, at.kind,
      s.code AS section_code, ti.field_type, ti.sort_order, ti.label,
      u.email AS uploaded_by_email
    FROM attachment at
    LEFT JOIN template_item ti ON ti.id = at.item_id
    LEFT JOIN section s ON s.id = ti.section_id
    LEFT JOIN app_user u ON u.id = at.uploaded_by
    WHERE at.audit_id = ${auditId}
    ORDER BY at.created_at, at.id
  `;

  return rows.map((r) => ({
    origin_id: r.origin_id,
    r2_key: r.r2_key,
    filename: r.filename,
    content_type: r.content_type,
    size_bytes: Number(r.size_bytes),
    kind: r.kind,
    item_key:
      r.section_code !== null &&
      r.field_type !== null &&
      r.sort_order !== null &&
      r.label !== null
        ? resolveItemKey({
            section_code: r.section_code,
            field_type: r.field_type,
            sort_order: r.sort_order,
            label: r.label
          })
        : null,
    uploaded_by_email: r.uploaded_by_email
  }));
}

// ── Resolvers en destino (import) ───────────────────────────────────────────
// Aceptan un cliente sql/tx opcional para correr dentro de la transacción del import.

export async function findClientByNaturalKey(
  c: ClientRef,
  db: Sql = getSql()
): Promise<{ id: string } | null> {
  if (c.cuit) {
    const [byCuit] = await db<{ id: string }[]>`
      SELECT id FROM client WHERE cuit = ${c.cuit} LIMIT 1
    `;
    if (byCuit) {
      return byCuit;
    }
  }
  const [byName] = await db<{ id: string }[]>`
    SELECT id FROM client WHERE lower(razon_social) = lower(${c.razon_social}) LIMIT 1
  `;
  return byName ?? null;
}

export async function findTemplateByCodeVersion(
  t: TemplateRef,
  db: Sql = getSql()
): Promise<{ id: string } | null> {
  const [row] = await db<{ id: string }[]>`
    SELECT id FROM template WHERE code = ${t.code} AND version = ${t.version} LIMIT 1
  `;
  return row ?? null;
}

/**
 * Índice `itemKeyString → template_item.id` para los templates indicados (R4).
 * Corazón del remapeo de ítems: JOIN template → section → template_item.
 */
export async function buildItemKeyIndex(
  templateIds: string[],
  db: Sql = getSql()
): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  if (templateIds.length === 0) {
    return index;
  }
  const rows = await db<
    { id: string; section_code: string; field_type: string; sort_order: number; label: string }[]
  >`
    SELECT ti.id, s.code AS section_code, ti.field_type, ti.sort_order, ti.label
    FROM template_item ti
    JOIN section s ON s.id = ti.section_id
    WHERE s.template_id = ANY(${templateIds}::uuid[])
  `;
  for (const r of rows) {
    index.set(itemKeyString(resolveItemKey(r)), r.id);
  }
  return index;
}

/** Índice `section_code → section.id` para los templates indicados. */
export async function buildSectionCodeIndex(
  templateIds: string[],
  db: Sql = getSql()
): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  if (templateIds.length === 0) {
    return index;
  }
  const rows = await db<{ id: string; code: string }[]>`
    SELECT id, code FROM section WHERE template_id = ANY(${templateIds}::uuid[])
  `;
  for (const r of rows) {
    index.set(r.code, r.id);
  }
  return index;
}

export async function findUserByEmail(
  email: string,
  db: Sql = getSql()
): Promise<{ id: string } | null> {
  const [row] = await db<{ id: string }[]>`
    SELECT id FROM app_user WHERE lower(email) = lower(${email}) LIMIT 1
  `;
  return row ?? null;
}
