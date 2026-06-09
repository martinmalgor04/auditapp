import { expect, test } from '@playwright/test';

test('manifest is fetchable', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  const contentType = response.headers()['content-type'] ?? '';
  expect(contentType).toMatch(/manifest|json/i);

  const manifest = (await response.json()) as { name: string; display: string };
  expect(manifest.name).toBe('SyS Auditorías');
  expect(manifest.display).toBe('standalone');
});
