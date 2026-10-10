import { expect, test } from '@playwright/test';

test('admin sign-in screen loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Operations console' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
