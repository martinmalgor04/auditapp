import { describe, expect, it } from 'vitest';
import { auditBundleSchema, type AuditBundle } from '../src/lib/server/bundle/schema';
import { BUNDLE_SCHEMA_VERSION } from '../src/lib/server/bundle/version';
import { CANONICAL_SCHEMA_VERSION } from '../src/lib/server/canonical/version';

function validBundle(): AuditBundle {
  return {
    bundle_schema_version: BUNDLE_SCHEMA_VERSION,
    dedupe_key: {
      origin_instance_id: 'inst-dev',
      origin_audit_id: '11111111-1111-1111-1111-111111111111'
    },
    exported_at: '2026-06-13T10:00:00.000Z',
    header: {
      name: 'Auditoría Demo SA',
      types: ['it'],
      templates: [{ code: 'it', version: '1.0' }],
      segment: 'A',
      status: 'en_relevamiento',
      client: { cuit: '30-12345678-9', razon_social: 'Demo SA', rubro: 'agro', provincia: 'Chaco' },
      assigned_tech: { email: 'tec@serviciosysistemas.com.ar' },
      created_by: { email: 'admin@serviciosysistemas.com.ar' },
      scheduled_at: '2026-06-20T13:00:00.000Z',
      closed_at: null
    },
    responses: [
      {
        item_key: { section_code: 'RED', field_type: 'tri', sort_order: 1, label: '¿Firewall?' },
        value: 'si',
        na: false,
        observations: null,
        source: 'tecnico',
        updated_by: { email: 'tec@serviciosysistemas.com.ar' }
      }
    ],
    section_scores: [
      {
        template: { code: 'it', version: '1.0' },
        section_code: 'RED',
        score: 80,
        score_breakdown: [{ itemId: 'local-1', points: 100 }],
        observations: null
      }
    ],
    closure: null,
    attachments: [
      {
        origin_id: '22222222-2222-2222-2222-222222222222',
        r2_key: 'audits/x/photo.jpg',
        filename: 'photo.jpg',
        content_type: 'image/jpeg',
        size_bytes: 1024,
        kind: 'photo',
        item_key: { section_code: 'RED', field_type: 'file_ref', sort_order: 2, label: 'Foto rack' },
        uploaded_by: { email: 'tec@serviciosysistemas.com.ar' }
      }
    ]
  };
}

describe('auditBundleSchema', () => {
  it('acepta un bundle válido', () => {
    const parsed = auditBundleSchema.parse(validBundle());
    expect(parsed.bundle_schema_version).toBe(BUNDLE_SCHEMA_VERSION);
    expect(parsed.responses).toHaveLength(1);
  });

  it('rechaza un bundle sin bundle_schema_version', () => {
    const bad = validBundle() as Record<string, unknown>;
    delete bad.bundle_schema_version;
    expect(() => auditBundleSchema.parse(bad)).toThrow();
  });

  it('rechaza un bundle con sección de score faltante (header.templates ausente)', () => {
    const bad = validBundle() as { header: Record<string, unknown> };
    delete bad.header.templates;
    expect(() => auditBundleSchema.parse(bad)).toThrow();
  });

  it('rechaza una respuesta con item_key incompleta', () => {
    const bad = validBundle();
    // sort_order no numérico
    (bad.responses[0].item_key as Record<string, unknown>).sort_order = 'x';
    expect(() => auditBundleSchema.parse(bad)).toThrow();
  });

  it('BUNDLE_SCHEMA_VERSION es distinto de CANONICAL_SCHEMA_VERSION', () => {
    expect(BUNDLE_SCHEMA_VERSION).not.toBe(CANONICAL_SCHEMA_VERSION);
  });

  it('cierre puede ser null y attachments puede ser vacío', () => {
    const b = validBundle();
    b.closure = null;
    b.attachments = [];
    const parsed = auditBundleSchema.parse(b);
    expect(parsed.closure).toBeNull();
    expect(parsed.attachments).toHaveLength(0);
  });
});
