import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const VERSION_JSON_PATH = resolve(process.cwd(), 'static/agente/version.json');

interface AgenteVersionJson {
  version: string;
  urlWindows: string;
  urlMac: string;
  sha256Windows: string;
  sha256Mac: string;
}

function leerVersionJson(): AgenteVersionJson {
  return JSON.parse(readFileSync(VERSION_JSON_PATH, 'utf8')) as AgenteVersionJson;
}

describe('static/agente/version.json (#61 T2, R29)', () => {
  it('existe, es JSON válido y declara la versión inicial 1.0.0 en semver', () => {
    const data = leerVersionJson();

    expect(data.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(data.version).toBe('1.0.0');
  });

  it('tiene URLs de descarga https para ambas plataformas', () => {
    const data = leerVersionJson();

    expect(data.urlWindows).toMatch(/^https:\/\//);
    expect(data.urlMac).toMatch(/^https:\/\//);
  });

  it('los sha256 están vacíos (placeholder) o son 64 hex', () => {
    const data = leerVersionJson();

    for (const sha of [data.sha256Windows, data.sha256Mac]) {
      expect(sha === '' || /^[0-9a-f]{64}$/.test(sha)).toBe(true);
    }
  });
});
