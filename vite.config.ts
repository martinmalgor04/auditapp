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
    globalSetup: ['tests/global-setup.ts'],
    globalTeardown: ['tests/global-teardown.ts'],
    setupFiles: ['tests/setup.ts'],
    retry: 0,
    testTimeout: 30_000,
    hookTimeout: 120_000
  }
});
