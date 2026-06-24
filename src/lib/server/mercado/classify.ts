/**
 * #43 — Clasificadores de dominio para `/mercado` accionable. Fuente única de la lógica de
 * agrupación de ERP, categorización de hallazgos y normalización de provincia. Vive en TS (no en
 * SQL) para que sea testeable de forma aislada y para que las queries solo traigan filas crudas del
 * universo (decisión de design §Alternativas descartadas).
 */

export type ErpGroup = 'tango' | 'competidor' | 'sin_erp';

export type FindingCategory =
  | 'backups'
  | 'seguridad'
  | 'licencias'
  | 'hardware_eol'
  | 'redes'
  | 'otros';

/** Quita acentos y pasa a minúsculas para comparar keywords sin falsos negativos. */
function normalizeText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Colapsa espacios internos y recorta extremos. */
function collapseSpaces(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Agrupa `empresa.erp_actual` en tres cubetas (R6): `sin_erp` para vacío o declaraciones de
 * ausencia, `tango` cuando el texto menciona Tango, y `competidor` para cualquier otro ERP
 * reconocible (SAP, Bejerman, Odoo, etc.).
 */
export function classifyErp(raw: string | null): ErpGroup {
  if (raw === null) {
    return 'sin_erp';
  }
  const normalized = collapseSpaces(normalizeText(raw));
  if (normalized === '') {
    return 'sin_erp';
  }
  if (['sin erp', 'ninguno', 'no', 'n/a', 'na', '-'].includes(normalized)) {
    return 'sin_erp';
  }
  if (normalized.includes('tango')) {
    return 'tango';
  }
  return 'competidor';
}

const FINDING_KEYWORDS: ReadonlyArray<{ category: FindingCategory; patterns: RegExp[] }> = [
  {
    category: 'backups',
    patterns: [/backup/, /respaldo/, /copia de seguridad/]
  },
  {
    category: 'seguridad',
    patterns: [
      /seguridad/,
      /firewall/,
      /antivirus/,
      /vulnerab/,
      /phishing/,
      /malware/,
      /ransomware/,
      /contrasen/,
      /password/
    ]
  },
  {
    category: 'licencias',
    patterns: [/licencia/, /office/, /suscripcion/, /legaliz/]
  },
  {
    category: 'hardware_eol',
    patterns: [
      /hardware/,
      /\beol\b/,
      /fin de vida/,
      /end of life/,
      /obsolet/,
      /fuera de soporte/,
      /disco/
    ]
  },
  {
    category: 'redes',
    patterns: [/\bred\b/, /redes/, /network/, /wifi/, /switch/, /router/, /cableado/, /conectividad/]
  }
];

/**
 * Categoriza un texto de hallazgo (`top_risks[].text` o `quick_wins[]`) por palabras clave (R12).
 * Prioridad por orden de la lista; sin coincidencia cae en `otros`. Solo se usa en server para
 * emitir conteos por categoría — el texto crudo nunca viaja al payload (R13).
 */
export function classifyFinding(text: string): FindingCategory {
  const normalized = normalizeText(text);
  for (const { category, patterns } of FINDING_KEYWORDS) {
    if (patterns.some((p) => p.test(normalized))) {
      return category;
    }
  }
  return 'otros';
}

/** Provincias del NEA (normalizadas) que marcan `is_nea: true` en el mapa (R8). */
export const NEA_PROVINCIAS: readonly string[] = ['chaco', 'corrientes', 'formosa', 'misiones'];

function titleCase(value: string): string {
  return value
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/**
 * Normaliza `empresa.provincia` (texto libre) a una clave de display canónica y un flag NEA (R8).
 * Variantes de caso/espacios colapsan a la misma clave; `NULL`/vacío → `Sin dato`.
 */
export function normalizeProvincia(raw: string | null): { key: string; is_nea: boolean } {
  if (raw === null) {
    return { key: 'Sin dato', is_nea: false };
  }
  const collapsed = collapseSpaces(raw);
  if (collapsed === '') {
    return { key: 'Sin dato', is_nea: false };
  }
  const lower = collapsed.toLowerCase();
  const deburred = normalizeText(collapsed);
  return { key: titleCase(lower), is_nea: NEA_PROVINCIAS.includes(deburred) };
}
