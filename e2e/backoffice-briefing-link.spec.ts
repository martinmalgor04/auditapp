import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test('copy briefing URL action present when token exists', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/tablero');

  const result = await page.evaluate(async () => {
    const fd = new FormData();
    fd.set('publicToken', 'e2e-briefing-token-demo');
    const res = await fetch('/tablero?/copyBriefingLink', {
      method: 'POST',
      body: fd,
      headers: {
        accept: 'application/json',
        'x-sveltekit-action': 'true'
      }
    });
    return { status: res.status, body: await res.json() };
  });

  expect(result.status).toBe(200);
  expect(result.body.type).toBe('success');
  expect(String(result.body.data)).toContain('/briefing/e2e-briefing-token-demo');
});
