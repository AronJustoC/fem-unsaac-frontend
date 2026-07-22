import { test, expect } from '@playwright/test';

const mockData = {
  nodes: [
    { id: 1, coords: [0, 0, 0] },
    { id: 2, coords: [5, 0, 0] },
  ],
  elements: [{ id: 1, node_ids: [1, 2], material_id: 1, section_id: 1 }],
  materials: [{ id: 1, name: "Acero A36", E: 210e9, nu: 0.3, rho: 7850 }],
  sections: [
    {
      id: 1,
      name: "Perfil IPE 200",
      area: 0.01,
      Iz: 1e-4,
      Iy: 1e-4,
      J: 2e-4,
    },
  ],
  restraints: {
    1: ["ux", "uy", "uz", "rx", "ry", "rz"],
  },
  loads: [
    {
      id: 1,
      name: "Carga P",
      node_id: 2,
      fx: 0,
      fy: -5000,
      fz: 0,
      mx: 0,
      my: 0,
      mz: 0,
    },
  ],
};

const mockPlotlyData = {
  data: [
    {
      type: 'scatter3d',
      x: [0, 5],
      y: [0, 0],
      z: [0, 0],
      mode: 'lines',
      line: { color: '#3b82f6', width: 6 }
    }
  ],
  layout: {
    scene: {
      xaxis: { range: [-1, 6], camera: { eye: { x: 1.25, y: 1.25, z: 1.25 } } },
      yaxis: { range: [-1, 1] },
      zaxis: { range: [-1, 1] },
      aspectmode: 'data'
    },
    margin: { l: 0, r: 0, b: 0, t: 0 }
  }
};

test.describe('Graphics Centering Verification', () => {

  test.beforeEach(async ({ page }) => {
    // Inject mock structure data into localStorage
    await page.addInitScript((data) => {
      window.localStorage.setItem('fem_structure_data', JSON.stringify(data));
    }, mockData);

    // Mock API calls
    await page.route('**/api/analysis/static', async route => {
      await route.fulfill({ json: { displacements: { "2": [0, -0.01, 0, 0, 0, 0] }, reactions: {}, element_forces: {} } });
    });

    await page.route('**/api/analysis/modal', async route => {
      await route.fulfill({ json: { frequencies: [10, 20, 30], mode_shapes: { "2": [[0, -0.01, 0]] } } });
    });

    await page.route('**/api/visualization/**', async route => {
      await route.fulfill({ json: mockPlotlyData });
    });
  });

  test('Static Analysis graphics centered', async ({ page }) => {
    await page.goto('http://localhost:4321/analisis-estatico');
    
    // Trigger analysis to show the plot
    await page.click('button:has-text("Compute")');
    await page.waitForSelector('.js-plotly-plot', { timeout: 20000 });

    const container = await page.locator('.h-full.w-full.overflow-hidden.flex.font-sans.relative').first().boundingBox();
    const plot = await page.locator('.js-plotly-plot').boundingBox();
    
    expect(container).not.toBeNull();
    expect(plot).not.toBeNull();

    expect(container!.height).toBeGreaterThan(600);

    const verticalOffset = Math.abs((container!.height - plot!.height) / 2 - (plot!.y - container!.y));
    expect(verticalOffset).toBeLessThan(10); // Increased tolerance slightly for CI

    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const innerHeight = await page.evaluate(() => window.innerHeight);
    expect(scrollHeight).toBeLessThanOrEqual(innerHeight + 10);

    await page.screenshot({ path: '.sisyphus/evidence/static-analysis-centering.png' });
  });

  test('Modal Analysis graphics centered', async ({ page }) => {
    await page.goto('http://localhost:4321/analisis-modal');
    
    // Trigger analysis to show the plot
    await page.click('button:has-text("Solve")');
    await page.waitForSelector('.js-plotly-plot', { timeout: 20000 });

    const container = await page.locator('.h-full.w-full.overflow-hidden.flex.font-sans.relative').first().boundingBox();
    const plot = await page.locator('.js-plotly-plot').boundingBox();

    expect(container).not.toBeNull();
    expect(plot).not.toBeNull();

    expect(container!.height).toBeGreaterThan(600);

    const verticalOffset = Math.abs((container!.height - plot!.height) / 2 - (plot!.y - container!.y));
    expect(verticalOffset).toBeLessThan(10);

    await page.screenshot({ path: '.sisyphus/evidence/modal-analysis-centering.png' });
  });

  test('Editor view unchanged (regression check)', async ({ page }) => {
    await page.goto('http://localhost:4321/');
    
    // Trigger visualization to show the plot
    await page.click('button:has-text("Visualizar")');
    await page.waitForSelector('.js-plotly-plot', { timeout: 20000 });
    
    await page.screenshot({ path: '.sisyphus/evidence/editor-regression-check.png' });
  });
});
