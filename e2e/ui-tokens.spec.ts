import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers';

test.describe('ui-tokens CSS', () => {
  test('font-family del body incluye Montserrat', async ({ page }) => {
    await loginAsAdmin(page);

    const fontFamily = await page.evaluate(() =>
      getComputedStyle(document.body).fontFamily
    );

    expect(fontFamily.toLowerCase()).toContain('montserrat');
  });
});
