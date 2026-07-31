import { expect, test } from '@playwright/test';

const structure = {
  nodes: [
    { id: 1, coords: [0, 0, 0], mass: 0 },
    { id: 2, coords: [2, 0, 0], mass: 10 },
  ],
  elements: [
    { id: 1, node_ids: [1, 2], material_id: 1, section_id: 1 },
  ],
  materials: [
    { id: 1, name: 'Acero A36', E: 210e9, nu: 0.3, rho: 7850 },
  ],
  sections: [
    {
      id: 1,
      name: 'H420x180',
      area: 0.000156,
      Iz: 1.969333333e-9,
      Iy: 3.7969333333e-8,
      J: 3.9938666666e-8,
      visual_shape: 'h',
      visual_height: 0.042,
      visual_width: 0.018,
      visual_web_thickness: 0.002,
      visual_flange_thickness: 0.002,
    },
  ],
  restraints: { 1: ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] },
  loads: [],
};

const labels = ['ux₁', 'uy₁', 'uz₁', 'rx₁', 'ry₁', 'rz₁', 'ux₂', 'uy₂', 'uz₂', 'rx₂', 'ry₂', 'rz₂'];
const diagonalMatrix = (factor: number) =>
  Array.from({ length: 12 }, (_, row) =>
    Array.from({ length: 12 }, (_, column) => (row === column ? factor * (row + 1) : 0)),
  );

test('modal element click opens responsive K/M inspector while animation is active', async ({ page }) => {
  await page.addInitScript((data) => {
    localStorage.setItem('fem_structure_data', JSON.stringify(data));
  }, structure);

  await page.route('**/api/analysis/modal', async (route) => {
    await route.fulfill({
      json: {
        frequencies: [4.25],
        mode_shapes: {
          '1': [[0, 0, 0, 0, 0, 0]],
          '2': [[0, 0.001, 0.0005, 0, 0, 0]],
        },
        mass_participation: [[1, 0, 0]],
      },
    });
  });

  await page.route('**/api/visualization/modal-results**', async (route) => {
    await route.fulfill({
      json: {
        data: [{
          type: 'scatter3d',
          mode: 'lines',
          name: 'Deformada 1',
          x: [0, 2000],
          y: [0, 1],
          z: [0, 0.5],
          customdata: [
            [0, 0, 0, 0, 0, 0, 1],
            [2000, 0, 0, 0, 1, 0.5, 1],
          ],
          line: { color: '#ff00ff', width: 5 },
        }],
        layout: {
          margin: { l: 0, r: 0, t: 0, b: 0 },
          scene: {
            xaxis: { range: [-100, 2100] },
            yaxis: { range: [-500, 500] },
            zaxis: { range: [-500, 500] },
          },
        },
      },
    });
  });

  let requestedElementId: number | null = null;
  await page.route('**/api/analysis/element-matrices', async (route) => {
    const body = route.request().postDataJSON();
    requestedElementId = body.element_id;
    await route.fulfill({
      json: {
        element_id: 1,
        node_ids: [1, 2],
        length_m: 2,
        mass_type: 'lumped',
        dof_labels: labels,
        properties: {
          material_name: 'Acero A36',
          section_name: 'H420x180',
          element_mass_kg: 2.4492,
        },
        checks: { stiffness_symmetry_error: 0, mass_symmetry_error: 0 },
        matrices: {
          stiffness: { local: diagonalMatrix(1e6), global: diagonalMatrix(2e6) },
          mass: { local: diagonalMatrix(0.2), global: diagonalMatrix(0.3) },
        },
      },
    });
  });

  await page.goto('/analisis-modal');
  await page.getByRole('button', { name: /solve/i }).click();
  const plot = page.locator('.js-plotly-plot');
  await expect(plot).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Selecciona una barra/)).toBeVisible();
  const deformationScale = page.locator('input[type="range"]').first();
  await expect(deformationScale).toHaveAttribute('max', '160');
  await expect(deformationScale).toHaveAttribute('step', '16');
  await expect(deformationScale).toHaveValue('80');

  // Emula el plotly_click real después de varios frames de restyle(): el
  // listener debe seguir registrado aun con "Animación rápida" activa.
  await page.waitForTimeout(500);
  await plot.evaluate((graph: any) => {
    graph.emit('plotly_click', { points: [{ customdata: [0, 0, 0, 0, 0, 0, 1] }] });
  });

  const inspector = page.getByRole('region', { name: 'Matrices del elemento 1' });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText('Nodos 1–2 · L = 2.0000 m · H420x180')).toBeVisible();
  expect(requestedElementId).toBe(1);

  await inspector.getByRole('tab', { name: 'M · Masa' }).click();
  await expect(inspector.getByText(/kg·m²/)).toBeVisible();
  await inspector.getByRole('tab', { name: 'global' }).click();
  await expect(inspector.getByText(/rotada al sistema XYZ/)).toBeVisible();
  await expect(inspector.getByRole('cell', { name: '0.3', exact: true }).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const box = await inspector.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
});
