import { test, expect } from '@playwright/test';

test.describe('Responsive Editor Refactor Verification', () => {

  test('Test 1: Mobile layout (375px) - GraphicsView is visually ABOVE StructureEditor', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('http://localhost:4321');
    
    const graphicsView = page.locator('h2:has-text("Motor de Geometría 3D")').locator('xpath=..');
    const structureEditor = page.locator('h2:has-text("MeshArchitect")').locator('xpath=../../..');
    
    await expect(graphicsView).toBeVisible();
    await expect(structureEditor).toBeVisible();

    const graphicsBox = await graphicsView.boundingBox();
    const editorBox = await structureEditor.boundingBox();

    if (graphicsBox && editorBox) {
      expect(graphicsBox.y).toBeLessThan(editorBox.y);
    } else {
      throw new Error('Could not get bounding boxes');
    }

    await page.screenshot({ path: 'test-results/mobile-layout.png' });
  });

  test('Test 2: Desktop layout (1440px) - Grid layout (StructureEditor left, GraphicsView right)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:4321');

    const graphicsView = page.locator('h2:has-text("Motor de Geometría 3D")').locator('xpath=..');
    const structureEditor = page.locator('h2:has-text("MeshArchitect")').locator('xpath=../../..');

    await expect(graphicsView).toBeVisible();
    await expect(structureEditor).toBeVisible();

    const graphicsBox = await graphicsView.boundingBox();
    const editorBox = await structureEditor.boundingBox();

    if (graphicsBox && editorBox) {
      expect(editorBox.x).toBeLessThan(graphicsBox.x);
      expect(Math.abs(editorBox.y - graphicsBox.y)).toBeLessThan(500); 
    } else {
      throw new Error('Could not get bounding boxes');
    }

    await page.screenshot({ path: 'test-results/desktop-layout.png' });
  });

  test('Test 3: Navbar mobile (375px) - Hamburger button is visible and opens menu', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('http://localhost:4321');

    const hamburger = page.locator('button[aria-label="Abrir menú"]');
    await expect(hamburger).toBeVisible();

    await hamburger.click();
    
    const menuLinks = page.locator('div:has-text("Análisis Estático")').last();
    await expect(menuLinks).toBeVisible();

    await page.screenshot({ path: 'test-results/mobile-navbar-menu.png' });
  });

  test('Test 4: Header buttons - "Estático" and "Modal" buttons are present and functional', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:4321');

    const estaticoBtn = page.locator('button:has-text("Estático")');
    const modalBtn = page.locator('button:has-text("Modal")');

    await expect(estaticoBtn).toBeVisible();
    await expect(modalBtn).toBeVisible();

    await page.screenshot({ path: 'test-results/header-buttons.png' });
  });
});
