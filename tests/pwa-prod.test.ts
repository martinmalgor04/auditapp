import { execSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const clientDir = resolve(root, 'build/client');

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case '.webmanifest':
      return 'application/manifest+json';
    case '.js':
      return 'application/javascript';
    case '.png':
      return 'image/png';
    default:
      return 'application/octet-stream';
  }
}

function startStaticServer(port: number): Server {
  return createServer((req, res) => {
    const pathname = req.url?.split('?')[0] ?? '/';
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    const filePath = join(clientDir, relative);

    if (!filePath.startsWith(clientDir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404).end();
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    res.end(readFileSync(filePath));
  }).listen(port);
}

// El build de producción puede no existir en CI/local sin `pnpm run build`.
// En ese caso saltamos la suite en vez de fallar con `previewBase` vacío.
const hasProdBuild = existsSync(resolve(clientDir, 'manifest.webmanifest'));
const describeIfBuild = hasProdBuild ? describe : describe.skip;

describeIfBuild('pwa production assets', () => {
  let server: Server | undefined;
  let previewBase = '';

  // Arranque perezoso e idempotente del server estático. No dependemos del
  // orden de ejecución de `beforeAll` bajo `pool: forks`: cada test garantiza
  // que el preview esté levantado antes de hacer fetch.
  async function ensureServer(): Promise<string> {
    if (previewBase) {
      return previewBase;
    }
    if (!existsSync(resolve(clientDir, 'manifest.webmanifest'))) {
      execSync('pnpm run build', { cwd: root, stdio: 'pipe' });
    }
    await new Promise<void>((resolveWait, reject) => {
      server = startStaticServer(0);
      server.once('listening', () => {
        const address = server!.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Could not bind static server'));
          return;
        }
        previewBase = `http://127.0.0.1:${address.port}`;
        resolveWait();
      });
      server.once('error', reject);
    });
    return previewBase;
  }

  beforeAll(async () => {
    await ensureServer();
  }, 120_000);

  afterAll(async () => {
    await new Promise<void>((resolveWait) => {
      server?.close(() => resolveWait());
    });
  });

  it('serves manifest with 200 from production container', async () => {
    const base = await ensureServer();
    const response = await fetch(`${base}/manifest.webmanifest`);
    expect(response.status).toBe(200);
    const contentTypeHeader = response.headers.get('content-type') ?? '';
    expect(contentTypeHeader).toMatch(/manifest|json/i);
    const manifest = (await response.json()) as { name: string; icons: Array<{ src: string }> };
    expect(manifest.name).toBe('SyS Auditorías');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  it('serves service worker', async () => {
    const base = await ensureServer();
    const response = await fetch(`${base}/sw.js`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('install');
  });

  it('serves pwa icons from static', async () => {
    const base = await ensureServer();
    for (const iconPath of ['/icons/icon-192.png', '/icons/icon-512.png']) {
      const response = await fetch(`${base}${iconPath}`);
      expect(response.status).toBe(200);
    }

    expect(existsSync(resolve(clientDir, 'manifest.webmanifest'))).toBe(true);
    expect(existsSync(resolve(clientDir, 'sw.js'))).toBe(true);
    expect(existsSync(resolve(clientDir, 'icons/icon-192.png'))).toBe(true);

    const manifest = JSON.parse(
      readFileSync(resolve(clientDir, 'manifest.webmanifest'), 'utf8')
    ) as { icons: Array<{ src: string }> };
    for (const icon of manifest.icons) {
      const file = resolve(clientDir, icon.src.replace(/^\//, ''));
      expect(existsSync(file)).toBe(true);
    }
  });
});
