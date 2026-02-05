import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/FEM Structure Editor/);
});

test('can toggle theme', async ({ page }) => {
  await page.goto('/');
  
  const html = page.locator('html');
  await expect(html).toHaveClass(/dark/);
  
  const themeToggle = page.locator('nav button').first();
  await themeToggle.click();
  
  await expect(html).not.toHaveClass(/dark/);
  
  await themeToggle.click();
  await expect(html).toHaveClass(/dark/);
});
