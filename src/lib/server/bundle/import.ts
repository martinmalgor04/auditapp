import { randomUUID } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';
import { getSql } from '$lib/server/db/client';
import type { AppUser } from '$lib/server/auth/types';
import { logger } from '$lib/server/logger';
import {
  buildItemKeyIndex,
  buildSectionCodeIndex,
  findClientByNaturalKey
} from '$lib/server/db/audit-bundle';
import { AuditBundleResolutionError, AuditBundleValidationError } from './errors';
import { itemKeyString } from './item-key';
import { resolveBundle, type ImportMode, type ResolutionReport } from './resolve';
import { auditBundleSchema, type AuditBundle, type ItemKey } from './schema';

export type ImportResult =
  | { mode: 'dry-run'; report: ResolutionReport }
  | {
      mode: 'strict' | 'permissive';
      auditId: string;
      duplicate: boolean;
      report: ResolutionReport;
    };

/** Status que requieren regenerar public_token en destino (OQ-3). */
const TOKEN_STATUSES = new Set(['briefing_enviado', 'briefing_completo']);

function parseBundle(raw: unknown): AuditBundle {
  const parsed = auditBundleSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new AuditBundleValidationError('Bundle inválido', issues);
  }
  return parsed.data;
}

/** Remapea attachment_ids embebidos (file_ref y table) de UUID de origen → locales (R11). */
function remapValueAttachmentIds(value: unknown, idMap: Map<string, string>): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const obj = value as Record<string, unknown>;

  // file_ref: { attachment_ids: [uuid] }
  if (Array.isArray(obj.attachment_ids)) {
    return {
      ...obj,
      attachment_ids: (obj.attachment_ids as string[]).map((id) => idMap.get(id) ?? id)
    };
  }

  // table: { rows: [{ row_id, cells, attachment_ids: [uuid] }] }
  if (Array.isArray(obj.rows)) {
    return {
      ...obj,
      rows: (obj.rows as Array<Record<string, unknown>>).map((row) => {
        if (Array.isArray(row.attachment_ids)) {
          return {
            ...row,
            attachment_ids: (row.attachment_ids as string[]).map((id) => idMap.get(id) ?? id)
          };
        }
        return row;
      })
    };
  }

  return value;
}

async function resolveUserId(
  tx: TransactionSql,
  ref: { email: string } | null,
  cache: Map<string, string | null>
): Promise<string | null> {
  if (!ref?.email) {
    return null;
  }
  if (cache.has(ref.email)) {
    return cache.get(ref.email) ?? null;
  }
  const [row] = await tx<{ id: string }[]>`
    SELECT id FROM app_user WHERE lower(email) = lower(${ref.email}) LIMIT 1
  `;
  const id = row?.id ?? null;
  cache.set(ref.email, id);
  return id;
}

/**
 * Import de un bundle de auditoría (R8–R17).
 *
 * - `dry-run` (default del endpoint): resuelve y reporta, sin escribir (R12).
 * - `strict`/`permissive`: escritura transaccional (R14). Resuelve por clave natural,
 *   crea audit + responses + section_scores + closure + attachments, remapea
 *   attachment_ids embebidos (R11) y relinkea adjuntos por r2_key.
 * - Idempotencia (R13): dedupe por {origin_instance_id, origin_audit_id}.
 */
export async function importAuditBundle(
  raw: unknown,
  user: AppUser,
  mode: ImportMode,
  db: Sql = getSql()
): Promise<ImportResult> {
  const bundle = parseBundle(raw);

  // Resolución (lectura). En dry-run se detiene acá.
  const { report } = await resolveBundle(bundle, mode, db);

  if (mode === 'dry-run') {
    return { mode: 'dry-run', report };
  }

  // Faltantes obligatorios (template/sección/ítem y, en strict, cliente) → no escribir (R15).
  if (report.missing.length > 0) {
    throw new AuditBundleResolutionError(report.missing);
  }

  const result = await db.begin(async (tx) => {
    // Dedupe dentro de la transacción (R13 + carrera): insert con ON CONFLICT DO NOTHING.
    const [existing] = await tx<{ audit_id: string }[]>`
      SELECT audit_id FROM audit_bundle_import
      WHERE origin_instance_id = ${bundle.dedupe_key.origin_instance_id}
        AND origin_audit_id = ${bundle.dedupe_key.origin_audit_id}
      LIMIT 1
    `;
    if (existing) {
      return { auditId: existing.audit_id, duplicate: true };
    }

    // Índices locales (dentro de la tx para coherencia).
    const templateIds: string[] = [];
    for (const ref of bundle.header.templates) {
      const [t] = await tx<{ id: string }[]>`
        SELECT id FROM template WHERE code = ${ref.code} AND version = ${ref.version} LIMIT 1
      `;
      if (!t) {
        // Resuelto antes; defensivo ante carrera.
        throw new AuditBundleResolutionError([`template ${ref.code}@${ref.version}`]);
      }
      templateIds.push(t.id);
    }
    const itemKeyToLocalId = await buildItemKeyIndex(templateIds, tx as unknown as Sql);
    const sectionCodeToLocalId = await buildSectionCodeIndex(templateIds, tx as unknown as Sql);

    const lookupItemId = (key: ItemKey): string => {
      const id = itemKeyToLocalId.get(itemKeyString(key));
      if (!id) {
        throw new AuditBundleResolutionError([
          `ítem ${key.section_code}/${key.field_type}/${key.sort_order}/${key.label}`
        ]);
      }
      return id;
    };

    // Cliente: match o (permissive) crear por clave natural (R17).
    let clientId: string;
    const clientMatch = await findClientByNaturalKey(bundle.header.client, tx as unknown as Sql);
    if (clientMatch) {
      clientId = clientMatch.id;
    } else if (mode === 'permissive') {
      const [created] = await tx<{ id: string }[]>`
        INSERT INTO client (razon_social, cuit, rubro, provincia, origen)
        VALUES (
          ${bundle.header.client.razon_social},
          ${bundle.header.client.cuit},
          ${bundle.header.client.rubro ?? null},
          ${bundle.header.client.provincia ?? null},
          'prospecto'
        )
        RETURNING id
      `;
      clientId = created.id;
    } else {
      // strict sin match: ya capturado en report.missing, defensivo.
      throw new AuditBundleResolutionError([
        `cliente ${bundle.header.client.cuit ?? bundle.header.client.razon_social}`
      ]);
    }

    const userCache = new Map<string, string | null>();
    const assignedTechId = await resolveUserId(tx, bundle.header.assigned_tech, userCache);
    const createdById = await resolveUserId(tx, bundle.header.created_by, userCache);

    // public_token: solo si status lo requiere (OQ-3); nunca se porta el de origen.
    const publicToken = TOKEN_STATUSES.has(bundle.header.status)
      ? `import-${randomUUID()}`
      : null;

    // 1. audit (id nuevo local)
    const [audit] = await tx<{ id: string }[]>`
      INSERT INTO audit (
        client_id, name, types, template_ids, segment, status,
        assigned_tech_id, created_by, scheduled_at, public_token, closed_at
      )
      VALUES (
        ${clientId},
        ${bundle.header.name},
        ${bundle.header.types},
        ${templateIds}::uuid[],
        ${bundle.header.segment},
        ${bundle.header.status},
        ${assignedTechId},
        ${createdById},
        ${bundle.header.scheduled_at},
        ${publicToken},
        ${bundle.header.closed_at}
      )
      RETURNING id
    `;
    const localAuditId = audit.id;

    // 2. attachments — relink por r2_key (reusar si ya existe) y mapa origin→local (R11).
    const attIdMap = new Map<string, string>();
    for (const att of bundle.attachments) {
      const uploadedById = await resolveUserId(tx, att.uploaded_by, userCache);
      const itemId = att.item_key ? lookupItemId(att.item_key) : null;
      const [existingAtt] = await tx<{ id: string }[]>`
        SELECT id FROM attachment WHERE r2_key = ${att.r2_key} LIMIT 1
      `;
      let localId: string;
      if (existingAtt) {
        localId = existingAtt.id;
      } else {
        const [inserted] = await tx<{ id: string }[]>`
          INSERT INTO attachment (
            audit_id, item_id, r2_key, filename, content_type, size_bytes, kind, uploaded_by
          )
          VALUES (
            ${localAuditId}, ${itemId}, ${att.r2_key}, ${att.filename},
            ${att.content_type}, ${att.size_bytes}, ${att.kind}, ${uploadedById}
          )
          RETURNING id
        `;
        localId = inserted.id;
      }
      attIdMap.set(att.origin_id, localId);
    }

    // 3. responses — remapear attachment_ids embebidos y ligar al item local.
    for (const r of bundle.responses) {
      const itemId = lookupItemId(r.item_key);
      const updatedById = await resolveUserId(tx, r.updated_by, userCache);
      const remappedValue = remapValueAttachmentIds(r.value, attIdMap);
      await tx`
        INSERT INTO audit_response (audit_id, item_id, value, na, observations, source, updated_by)
        VALUES (
          ${localAuditId}, ${itemId}, ${tx.json(remappedValue as never)},
          ${r.na}, ${r.observations}, ${r.source}, ${updatedById}
        )
        ON CONFLICT (audit_id, item_id) DO NOTHING
      `;
    }

    // 4. section_scores — por section_code (resuelto vía templates locales).
    for (const s of bundle.section_scores) {
      const sectionId = sectionCodeToLocalId.get(s.section_code);
      if (!sectionId) {
        throw new AuditBundleResolutionError([`sección ${s.section_code}`]);
      }
      await tx`
        INSERT INTO audit_section_score (audit_id, section_id, score, score_breakdown, observations)
        VALUES (
          ${localAuditId}, ${sectionId}, ${s.score},
          ${tx.json((s.score_breakdown ?? []) as never)}, ${s.observations}
        )
        ON CONFLICT (audit_id, section_id) DO NOTHING
      `;
    }

    // 5. closure
    if (bundle.closure) {
      const closedById = await resolveUserId(tx, bundle.closure.closed_by, userCache);
      await tx`
        INSERT INTO audit_closure (
          audit_id, indice_it, indice_erp, top_risks, quick_wins,
          upsell_findings, next_step, closed_by, closed_at
        )
        VALUES (
          ${localAuditId}, ${bundle.closure.indice_it}, ${bundle.closure.indice_erp},
          ${tx.json((bundle.closure.top_risks ?? []) as never)},
          ${tx.json((bundle.closure.quick_wins ?? []) as never)},
          ${tx.json((bundle.closure.upsell_findings ?? []) as never)},
          ${bundle.closure.next_step}, ${closedById}, ${bundle.closure.closed_at}
        )
      `;
    }

    // 6. dedupe (R13) — registra el import dentro de la misma tx (R14).
    await tx`
      INSERT INTO audit_bundle_import (origin_instance_id, origin_audit_id, audit_id, imported_by)
      VALUES (
        ${bundle.dedupe_key.origin_instance_id},
        ${bundle.dedupe_key.origin_audit_id},
        ${localAuditId},
        ${user.id}
      )
      ON CONFLICT (origin_instance_id, origin_audit_id) DO NOTHING
    `;

    return { auditId: localAuditId, duplicate: false };
  });

  logger.info('audit_bundle_imported', {
    auditId: result.auditId,
    duplicate: result.duplicate,
    mode
  });

  return { mode, auditId: result.auditId, duplicate: result.duplicate, report };
}
