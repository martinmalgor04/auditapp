import type { Sql } from 'postgres';
import { getSql } from '$lib/server/db/client';
import {
  buildItemKeyIndex,
  buildSectionCodeIndex,
  findClientByNaturalKey,
  findTemplateByCodeVersion,
  findUserByEmail
} from '$lib/server/db/audit-bundle';
import { itemKeyString } from './item-key';
import type { AuditBundle, ItemKey, TemplateRef } from './schema';

export type ImportMode = 'dry-run' | 'strict' | 'permissive';

export type ResolutionReport = {
  client: { matched: boolean; willCreate: boolean };
  templates: Array<{ ref: TemplateRef; matched: boolean }>;
  sections: Array<{ section_code: string; matched: boolean }>;
  items: Array<{ item_key: ItemKey; matched: boolean }>;
  users: Array<{ email: string; matched: boolean }>;
  missing: string[];
  would_create: string[];
};

/** IDs locales resueltos para usar en la escritura (solo válido si `missing` está vacío). */
export type ResolvedIds = {
  clientId: string | null; // null = se debe crear (permissive)
  templateIds: string[];
  itemKeyToLocalId: Map<string, string>;
  sectionCodeToLocalId: Map<string, string>;
  userEmailToLocalId: Map<string, string | null>;
};

export type ResolveOutcome = {
  report: ResolutionReport;
  resolved: ResolvedIds;
};

function collectUserEmails(bundle: AuditBundle): string[] {
  const emails = new Set<string>();
  const add = (ref: { email: string } | null) => {
    if (ref?.email) {
      emails.add(ref.email);
    }
  };
  add(bundle.header.assigned_tech);
  add(bundle.header.created_by);
  for (const r of bundle.responses) add(r.updated_by);
  if (bundle.closure) add(bundle.closure.closed_by);
  for (const a of bundle.attachments) add(a.uploaded_by);
  return [...emails];
}

/**
 * Resuelve todas las entidades del bundle por clave natural en destino (lectura) y
 * arma el `ResolutionReport` y los IDs locales. No escribe nada.
 *
 * - Cliente: match por CUIT, fallback razón social (R17, OQ-2). `strict` sin match → missing;
 *   `permissive` sin match → willCreate.
 * - Templates/secciones/ítems: faltante = error obligatorio (R15) — siempre en `missing`.
 *   Drift de ítem (sort_order coincide pero field_type difiere) ⇒ no matchea ⇒ missing (OQ-1).
 * - Usuarios: ausente ⇒ NULL en FK nullable, no es faltante obligatorio (R17).
 */
export async function resolveBundle(
  bundle: AuditBundle,
  mode: ImportMode,
  db: Sql = getSql()
): Promise<ResolveOutcome> {
  const missing: string[] = [];
  const wouldCreate: string[] = [];

  // 1. Templates
  const templateIds: string[] = [];
  const templates: ResolutionReport['templates'] = [];
  for (const ref of bundle.header.templates) {
    const found = await findTemplateByCodeVersion(ref, db);
    templates.push({ ref, matched: found !== null });
    if (found) {
      templateIds.push(found.id);
    } else {
      missing.push(`template ${ref.code}@${ref.version}`);
    }
  }

  // 2. Índices de sección e ítem (solo de los templates encontrados)
  const sectionCodeToLocalId = await buildSectionCodeIndex(templateIds, db);
  const itemKeyToLocalId = await buildItemKeyIndex(templateIds, db);

  // 3. Secciones referenciadas por los scores
  const sectionsSeen = new Set<string>();
  const sections: ResolutionReport['sections'] = [];
  for (const s of bundle.section_scores) {
    if (sectionsSeen.has(s.section_code)) continue;
    sectionsSeen.add(s.section_code);
    const matched = sectionCodeToLocalId.has(s.section_code);
    sections.push({ section_code: s.section_code, matched });
    if (!matched) {
      missing.push(`sección ${s.section_code}`);
    }
  }

  // 4. Ítems referenciados por respuestas y adjuntos (clave estable de 4 campos, OQ-1)
  const itemsSeen = new Set<string>();
  const items: ResolutionReport['items'] = [];
  const checkItem = (key: ItemKey) => {
    const ks = itemKeyString(key);
    if (itemsSeen.has(ks)) return;
    itemsSeen.add(ks);
    const matched = itemKeyToLocalId.has(ks);
    items.push({ item_key: key, matched });
    if (!matched) {
      missing.push(
        `ítem ${key.section_code}/${key.field_type}/${key.sort_order}/${key.label}`
      );
    }
  };
  for (const r of bundle.responses) checkItem(r.item_key);
  for (const a of bundle.attachments) {
    if (a.item_key) checkItem(a.item_key);
  }

  // 5. Cliente (match-or-create según modo)
  const clientMatch = await findClientByNaturalKey(bundle.header.client, db);
  let clientId: string | null = clientMatch?.id ?? null;
  let clientWillCreate = false;
  if (!clientMatch) {
    if (mode === 'strict') {
      missing.push(
        `cliente ${bundle.header.client.cuit ?? bundle.header.client.razon_social}`
      );
    } else if (mode === 'permissive') {
      clientWillCreate = true;
      wouldCreate.push(`client ${bundle.header.client.razon_social}`);
    } else {
      // dry-run: reporta lo que pasaría en permissive (la decisión se toma en escritura).
      clientWillCreate = true;
    }
  }

  // 6. Usuarios (ausente ⇒ NULL, nunca faltante obligatorio)
  const userEmailToLocalId = new Map<string, string | null>();
  const users: ResolutionReport['users'] = [];
  for (const email of collectUserEmails(bundle)) {
    const found = await findUserByEmail(email, db);
    userEmailToLocalId.set(email, found?.id ?? null);
    users.push({ email, matched: found !== null });
  }

  wouldCreate.push('audit');
  wouldCreate.push(`${bundle.responses.length} responses`);
  wouldCreate.push(`${bundle.section_scores.length} section_scores`);
  wouldCreate.push(`${bundle.attachments.length} attachments`);
  if (bundle.closure) {
    wouldCreate.push('closure');
  }

  return {
    report: {
      client: { matched: clientMatch !== null, willCreate: clientWillCreate },
      templates,
      sections,
      items,
      users,
      missing,
      would_create: wouldCreate
    },
    resolved: {
      clientId,
      templateIds,
      itemKeyToLocalId,
      sectionCodeToLocalId,
      userEmailToLocalId
    }
  };
}
