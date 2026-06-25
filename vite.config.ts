import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }
    },
    sequence: { concurrent: false, hooks: 'list' },
    // Con `singleFork` los stubs de globals (p. ej. `vi.stubGlobal('fetch')`)
    // persisten entre archivos. Restaurarlos automáticamente evita fugas como
    // un `fetch` mockeado filtrándose a tests posteriores (pwa-prod).
    unstubGlobals: true,
    globalSetup: ['tests/global-setup.ts'],
    // globalTeardown no está tipado en InlineConfig de esta versión de vitest
    ...({ globalTeardown: ['tests/global-teardown.ts'] } as object),
    setupFiles: ['tests/setup.ts'],
    retry: 0,
    testTimeout: 60_000,
    hookTimeout: 120_000
  }
});
