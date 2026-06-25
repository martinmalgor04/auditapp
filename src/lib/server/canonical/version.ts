/**
 * Contrato JSON canónico auditapp ↔ pipeline IA / estudio mercado.
 *
 * Política MAJOR.MINOR:
 * - Campo opcional nuevo → MINOR (1.0 → 1.1); consumidores toleran claves desconocidas.
 * - Renombrar / quitar / cambiar tipo → MAJOR (1.0 → 2.0); coordinar pipeline n8n.
 * - Cambios solo en preview UI no afectan schema_version.
 *
 * Changelog:
 * - 1.0 → 1.1: campos opcionales iniciales del contrato IA.
 * - 1.1 → 1.2 (#45): campo opcional `rows` en ítems field_type='table'
 *   (filas de inventario con celdas + claves R2 de fotos por fila).
 */
export const CANONICAL_SCHEMA_VERSION = '1.2' as const;
