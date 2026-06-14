/**
 * Contrato JSON canónico auditapp ↔ pipeline IA / estudio mercado.
 *
 * Política MAJOR.MINOR:
 * - Campo opcional nuevo → MINOR (1.0 → 1.1); consumidores toleran claves desconocidas.
 * - Renombrar / quitar / cambiar tipo → MAJOR (1.0 → 2.0); coordinar pipeline n8n.
 * - Cambios solo en preview UI no afectan schema_version.
 */
export const CANONICAL_SCHEMA_VERSION = '1.1' as const;
