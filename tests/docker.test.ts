import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const clientDir = resolve(root, 'build/client');
const dockerAvailable = process.env.DOCKER_AVAILABLE === '1';

function ensureClientBuild(): void {
  if (existsSync(clientDir)) {
    return;
  }
  execSync('pnpm run build', { cwd: root, stdio: 'pipe' });
}

function readDockerfile(): string {
  return readFileSync(resolve(root, 'Dockerfile'), 'utf8');
}

function walkClientFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkClientFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

describe('Docker production image', () => {
  it('Dockerfile defines multi-stage deps build runtime', () => {
    const dockerfile = readDockerfile();
    expect(dockerfile).toMatch(/FROM node:22-bookworm-slim AS deps/);
    expect(dockerfile).toMatch(/FROM node:22-bookworm-slim AS build/);
    expect(dockerfile).toMatch(/FROM node:22-bookworm-slim AS runtime/);
  });

  it('runtime image is debian-based', () => {
    const dockerfile = readDockerfile();
    expect(dockerfile).toContain('node:22-bookworm-slim');
    expect(dockerfile).not.toContain('alpine');
  });

  it('Dockerfile defines HEALTHCHECK', () => {
    const dockerfile = readDockerfile();
    expect(dockerfile).toContain('HEALTHCHECK');
    expect(dockerfile).toContain('/health');
  });

  it('container listens on PORT env', () => {
    const dockerfile = readDockerfile();
    expect(dockerfile).toContain('ENV PORT=3033');
    expect(dockerfile).toContain('EXPOSE 3033');
  });

  it('client bundle does not contain SESSION_SECRET or R2_SECRET', () => {
    ensureClientBuild();
    const contents = walkClientFiles(clientDir)
      .filter((f) => /\.(js|css|html|json)$/.test(f))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');

    expect(contents).not.toContain('SESSION_SECRET');
    expect(contents).not.toMatch(/R2_SECRET_ACCESS_KEY/);
  });

  it.skipIf(!dockerAvailable)('docker build succeeds', () => {
    execSync('docker build -t auditapp:test .', { cwd: root, stdio: 'pipe' });
  });

  it.skipIf(!dockerAvailable)('runtime container runs argon2 native binding', () => {
    const result = spawnSync(
      'docker',
      [
        'run',
        '--rm',
        'auditapp:test',
        'node',
        '-e',
        "import('@node-rs/argon2').then(() => process.exit(0)).catch(() => process.exit(1))"
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
  });
});
