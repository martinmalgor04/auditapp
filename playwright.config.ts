import { defineConfig, devices } from '@playwright/test';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://auditapp:changeme@localhost:5432/auditapp';
}

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  globalSetup: 'e2e/global-setup.ts',
  webServer: {
    command: 'pnpm run build && pnpm run preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://auditapp:changeme@localhost:5432/auditapp',
      SESSION_SECRET:
        process.env.SESSION_SECRET ?? 'test-secret-min-32-characters-long!!',
      PUBLIC_APP_URL: 'http://localhost:4173',
      // Informe IA (#14): adapter fake — la suite corre sin credenciales reales (R28/R29)
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? 'e2e-fake-key',
      INFORME_FAKE: '1',
      // La suite serial supera los 5 logins/min del rate limit con una sola IP.
      LOGIN_RATE_LIMIT_DISABLED: '1'
    }
  }
});
