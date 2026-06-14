/**
 * Versión del bundle portable de auditoría (#20 export/import).
 *
 * Distinta de `CANONICAL_SCHEMA_VERSION` ('1.1', canonical/version.ts): el bundle es un
 * superset fiel para round-trip entre instancias, no el formato derivado/lossy del pipeline IA.
 *
 * Política MAJOR.MINOR (espejo de canonical/version.ts):
 * - Campo opcional nuevo → MINOR; el import tolera claves desconocidas.
 * - Renombrar / quitar / cambiar tipo → MAJOR.
 */
export const BUNDLE_SCHEMA_VERSION = '1.0' as const;
