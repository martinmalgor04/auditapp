#!/usr/bin/env tsx
/**
 * Exporta el contrato `dispositivoInput` (#59) a JSON Schema (draft-07) para
 * el agente sys-scan-agent (#61, R25). El agente valida cada dispositivo
 * contra este schema ANTES de encolarlo; AuditApp sigue siendo la autoridad
 * final (Zod server-side).
 *
 * Salida: `static/agente/dispositivo-input.schema.json` — canal público
 * agente↔AuditApp (mismo lugar que `version.json`, T2); el repo del agente
 * lo vendora y lo contrasta en su test de contrato.
 *
 * Uso: `pnpm run export:escaneo-schema`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { dispositivoInput } from '../src/lib/server/escaneos/schemas';

export const SCHEMA_OUTPUT_PATH = 'static/agente/dispositivo-input.schema.json';

/** MAC post-normalización del agente (#59 R15): 12 hex minúsculas. */
const MAC_PATTERN = '^[0-9a-f]{12}$';

type JsonSchemaObject = {
  $ref?: string;
  definitions?: Record<string, { properties?: Record<string, JsonSchemaProperty> }>;
  [key: string]: unknown;
};

type JsonSchemaProperty = {
  type?: string;
  anyOf?: JsonSchemaProperty[];
  description?: string;
  pattern?: string;
  [key: string]: unknown;
};

/**
 * Genera el JSON Schema del contrato. `$refStrategy: 'none'` deja un archivo
 * autocontenido (sin $refs externos) para que el validador del agente no
 * resuelva documentos externos.
 */
export function buildDispositivoInputSchema(): JsonSchemaObject {
  const schema = zodToJsonSchema(dispositivoInput, {
    name: 'DispositivoInput',
    target: 'jsonSchema7',
    $refStrategy: 'none',
    // Con transforms (macNormalizada) el schema describe el INPUT del pipe.
    effectStrategy: 'input',
    dateStrategy: 'format:date-time'
  }) as JsonSchemaObject;

  const properties = schema.definitions?.DispositivoInput?.properties;
  if (!properties?.mac) {
    throw new Error('Estructura inesperada al exportar dispositivoInput (falta definitions.DispositivoInput.mac)');
  }

  // El transform de `macNormalizada` no es representable en JSON Schema; el
  // agente normaliza ANTES de validar (R25), así que el patrón fiel al
  // contrato es el de la MAC ya normalizada. Se inyecta en la rama string
  // del anyOf (el campo es nullish).
  for (const branch of properties.mac.anyOf ?? []) {
    if (branch.type === 'string') {
      branch.pattern = MAC_PATTERN;
      branch.description = 'MAC normalizada: 12 hex minúsculas (#59 R15).';
    }
  }

  return schema;
}

export function exportDispositivoInputSchema(rootDir = process.cwd()): string {
  const schema = buildDispositivoInputSchema();
  const outputPath = resolve(rootDir, SCHEMA_OUTPUT_PATH);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
  return outputPath;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const outputPath = exportDispositivoInputSchema();
  console.log(`Schema exportado: ${outputPath}`);
}
