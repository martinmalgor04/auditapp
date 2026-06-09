export { createSql, getSql, resetSqlForTests } from './client';
export { runMigrations, resetDatabase, type MigrationResult } from './migrate';
export {
  FIELD_TYPES,
  optionsSchemaFor,
  valueSchemaFor,
  validateOptions,
  type FieldType
} from './field-schemas';
export {
  AUDIT_STATUSES,
  isValidAuditStatus,
  isValidAuditStatusTransition,
  isBriefingEditable,
  type AuditStatus
} from './audit-status';
export { runSeed, type SeedOptions } from './seed';

/** Ping opcional para health checks futuros; en stub no ejecuta query real. */
export async function pingDb(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    return false;
  }
  return true;
}
