import { refTokenForType, type AuditType } from '$lib/audit-types';
import { normalizeCuit } from './schema';
import type { RawRow } from './parse';

/** Stopwords societarias/conectores ignoradas al generar empresa.codigo (#41, R1). */
const EMPRESA_CODE_STOPWORDS = new Set([
  'SA',
  'S.A.',
  'SRL',
  'S.R.L.',
  'SAS',
  'SOCIEDAD',
  'RESPONSABILIDAD',
  'LIMITADA',
  'ANONIMA',
  'ANÓNIMA',
  'DE',
  'DEL',
  'LA',
  'LAS',
  'EL',
  'LOS',
  'Y',
  'E'
]);

function isStopword(token: string): boolean {
  const upper = token.toUpperCase();
  if (EMPRESA_CODE_STOPWORDS.has(upper)) return true;
  const noDots = upper.replace(/\./g, '');
  for (const sw of EMPRESA_CODE_STOPWORDS) {
    if (sw.replace(/\./g, '') === noDots) return true;
  }
  return false;
}

/** Mayúsculas, sin acentos, espacios colapsados. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Código corto de empresa a partir de razón social (#41, R1–R2).
 * Máximo 5 caracteres; mínimo 3 completando con letras del primer token significativo.
 */
export function buildEmpresaCode(razonSocial: string): string {
  const normalized = normalizeForMatch(razonSocial);
  const tokens = normalized.split(' ').filter(Boolean);
  let firstSignificant: string | null = null;
  let result = '';

  for (const token of tokens) {
    if (isStopword(token)) continue;
    if (!firstSignificant) firstSignificant = token;
    result += token.charAt(0);
    if (result.length >= 5) break;
  }

  if (result.length < 3 && firstSignificant) {
    let padFrom = 1;
    while (result.length < 3) {
      if (padFrom < firstSignificant.length) {
        result += firstSignificant.charAt(padFrom);
        padFrom += 1;
      } else {
        result += firstSignificant.charAt(0);
      }
    }
  }

  return result.slice(0, 5);
}

/** Compone audit.ref_code (#41, R5). */
export function formatRefCode(codigo: string, auditType: AuditType, seq: number): string {
  const token = refTokenForType(auditType);
  const nnnn = String(seq).padStart(4, '0');
  return `${codigo}-${token}-${nnnn}`;
}

/** Columnas que el CRM persiste. NADA fuera de este set toca la DB. */
export const CANONICAL_FIELDS = [
  'razon_social',
  'cuit',
  'direccion',
  'cp',
  'provincia',
  'telefono',
  'email'
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

/** Encabezado de entrada (trim+lowercase) -> campo canónico. Cubre el aliasing (R5.bis). */
export const HEADER_ALIASES: Record<string, CanonicalField> = {
  razon_social: 'razon_social',
  'razón social': 'razon_social', // alias acentuado
  'razon social': 'razon_social', // tolerancia sin acento
  cuit: 'cuit',
  numero_doc: 'cuit', // alias del CSV fuente
  direccion: 'direccion',
  dirección: 'direccion',
  cp: 'cp',
  provincia: 'provincia',
  telefono: 'telefono',
  teléfono: 'telefono',
  email: 'email'
};

export type NormalizedRow = {
  razon_social: string;
  cuit: string | null;
  direccion: string | null;
  cp: string | null;
  provincia: string | null;
  telefono: string | null;
  email: string | null;
};

/** Clave de encabezado para aliasing: trim + lowercase. */
function headerKey(header: string): string {
  return header.trim().toLowerCase();
}

/** Vacío o solo-espacios -> null (mismo criterio que emptyToNull del seed). */
function emptyToNull(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Aplica HEADER_ALIASES descartando columnas desconocidas, emptyToNull en opcionales
 * y normalizeCuit en cuit. La última columna que mapea a un campo canónico gana.
 */
export function normalizeRow(raw: RawRow): NormalizedRow {
  const mapped: Partial<Record<CanonicalField, string>> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = HEADER_ALIASES[headerKey(header)];
    if (field) {
      mapped[field] = value;
    }
  }

  return {
    razon_social: (mapped.razon_social ?? '').trim(),
    cuit: normalizeCuit(mapped.cuit),
    direccion: emptyToNull(mapped.direccion),
    cp: emptyToNull(mapped.cp),
    provincia: emptyToNull(mapped.provincia),
    telefono: emptyToNull(mapped.telefono),
    email: emptyToNull(mapped.email)
  };
}

/** Inspecciona los encabezados del archivo y devuelve cuáles se mapean e ignoran (R5.ter). */
export function inspectHeaders(headers: string[]): { mapped: string[]; ignored: string[] } {
  const mapped: string[] = [];
  const ignored: string[] = [];
  for (const header of headers) {
    if (HEADER_ALIASES[headerKey(header)]) {
      mapped.push(header);
    } else {
      ignored.push(header);
    }
  }
  return { mapped, ignored };
}
