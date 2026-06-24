import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('pwa service worker', () => {
  const swPath = join(process.cwd(), 'static/sw.js');

  it('SW file registers precache shell and network-first api', () => {
    const source = readFileSync(swPath, 'utf8');
    expect(source).toContain('install');
    expect(source).toContain("'/api/'");
    expect(source).toContain('PRECACHE_URLS');
    expect(source).toContain("fetch(event.request)");
    expect(source).toContain("event.request.mode === 'navigate'");
  });

  it('api fetch uses network not cache-only', () => {
    const source = readFileSync(swPath, 'utf8');
    expect(source).toContain("url.pathname.startsWith('/api/')");
    expect(source).not.toMatch(/caches\.match\(event\.request\)[\s\S]*?\/api\//);
  });

  it('sveltekit data endpoints bypass cache', () => {
    const source = readFileSync(swPath, 'utf8');
    expect(source).toContain('__data.json');
    expect(source).toContain('x-sveltekit-loader');
    expect(source).toContain('isNetworkOnlyRequest');
  });

  it('only immutable app chunks use cache-first', () => {
    const source = readFileSync(swPath, 'utf8');
    expect(source).toContain('/_app/immutable/');
    expect(source).toContain('isImmutableAsset');
  });
});
